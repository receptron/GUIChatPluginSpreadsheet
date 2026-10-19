/**
 * Statistical Functions
 */

import {
  functionRegistry,
  blankAwareRangeReader,
  requiredArg,
  toNumber,
  criteriaArg,
  type FunctionContext,
  type FunctionHandler,
  type RangeGetter,
} from "../registry";
import { computeAverage, computeMedian, computeMode, sampleStdev, sampleVariance } from "./statistical-math";
import { DIV_ZERO_ERROR, isSpreadsheetErrorValue, type SpreadsheetError } from "../spreadsheet-errors";
import { holdsNumber, isRangeNumber } from "../numericCoercion";
import type { CellValue } from "../types";

// Excel accepts up to 255 arguments for its aggregate functions.
const MAX_AGGREGATE_ARGS = 255;

// `A1`, `$A$1`, `AA100`: column letters then row digits, each half optionally
// prefixed by `$`.
const CELL_REFERENCE_PATTERN = /^\$?[A-Z]+\$?\d+$/i;

const isCellReference = (segment: string): boolean => CELL_REFERENCE_PATTERN.test(segment);

// Everything after the last `!` — the reference without its sheet name, or the
// whole string when it carries none.
const withoutSheetPrefix = (value: string): string => value.slice(value.lastIndexOf("!") + 1);

const isRangeReference = (value: string): boolean => {
  if (!value) return false;
  const [start, end] = withoutSheetPrefix(value).split(":");
  if (!start || !end) return false;
  return isCellReference(start) && isCellReference(end);
};

// A bare cell reference (`A1`, `Sheet1!B2`) is read through the RANGE path, not
// evaluated as a scalar: the scalar path coerces a blank or text cell to 0, so
// COUNT(A999) counted an empty cell as a value. The range path yields nothing
// for a cell that holds nothing, which is what the count functions need.
const isReference = (arg: string): boolean => isRangeReference(arg) || isCellReference(withoutSheetPrefix(arg));

/** One value an argument contributed, tagged by where it came from. A range cell
 *  was already filtered by the range getter; a scalar is whatever the argument
 *  evaluated to and may hold no number at all. */
interface ArgumentValue {
  value: CellValue;
  isScalar: boolean;
}

export const collectArgumentValues = (args: string[], context: FunctionContext, readRange: RangeGetter): ArgumentValue[] => {
  const collected: ArgumentValue[] = [];

  for (const rawArg of args) {
    const arg = rawArg?.trim();
    if (!arg) continue;

    if (isReference(arg)) {
      readRange(arg).forEach((value) => collected.push({ value, isScalar: false }));
    } else {
      collected.push({ value: context.evaluateFormula(arg), isScalar: true });
    }
  }

  return collected;
};

/** The numbers an aggregate reads from its arguments, or the first error among them in argument
 *  order — an error cell in a range, or an argument that evaluated to one — read in one pass, so
 *  no argument is read or evaluated twice. A range keeps only the cells that hold a number, as the
 *  numeric read does. */
export const collectNumbersOrError = (args: string[], context: FunctionContext): number[] | SpreadsheetError => {
  if (!context.getRangeValuesKeepingBlanks) return numbersOrErrorWithoutBlankRead(args, context);
  const collected = collectArgumentValues(args, context, context.getRangeValuesKeepingBlanks);
  const firstError = collected.map(({ value }) => value).find(isSpreadsheetErrorValue);
  if (firstError) return firstError;
  return collected.filter(({ value, isScalar }) => isScalar || isRangeNumber(value)).map(({ value }) => toNumber(value));
};

/** A host without the blank-aware read cannot tell a blank from a 0 in one read, so its errors
 *  come from the raw read and its numbers from the numeric read — two reads, for that host only. */
function numbersOrErrorWithoutBlankRead(args: string[], context: FunctionContext): number[] | SpreadsheetError {
  const perArgument = args
    .map((rawArg) => rawArg?.trim() ?? "")
    .filter((arg) => arg !== "")
    .map((arg): { error?: SpreadsheetError; numbers: number[] } => {
      if (isReference(arg))
        return { error: context.getRangeValuesRaw?.(arg).find(isSpreadsheetErrorValue), numbers: context.getRangeValues(arg).map(toNumber) };
      const value = context.evaluateFormula(arg);
      return isSpreadsheetErrorValue(value) ? { error: value, numbers: [] } : { numbers: [toNumber(value)] };
    });
  return perArgument.find(({ error }) => error)?.error ?? perArgument.flatMap(({ numbers }) => numbers);
}

/** The cells of a range read blank-aware that hold a number, as numbers — what the numeric read keeps. */
export const rangeNumbers = (values: CellValue[]): number[] => values.filter(isRangeNumber).map(toNumber);

/** The handler's rule over the numbers of its arguments, or the first error among them. */
export const overNumbers =
  (rule: (values: number[]) => CellValue): FunctionHandler =>
  (args, context) => {
    const values = collectNumbersOrError(args, context);
    return Array.isArray(values) ? rule(values) : values;
  };

export const collectNumericValues = (args: string[], context: FunctionContext): number[] =>
  collectArgumentValues(args, context, context.getRangeValues).map(({ value }) => toNumber(value));

// Same walk as `collectNumericValues`, but keeping each cell as it is: COUNTA
// counts non-empty cells, so text must survive the trip.
const collectRawValues = (args: string[], context: FunctionContext): CellValue[] =>
  collectArgumentValues(args, context, blankAwareRangeReader(context)).map(({ value }) => value);

const sumHandler = overNumbers((values) => values.reduce((sum, value) => sum + value, 0));

// Multi-argument collection (#2360) feeding the empty-range error rule (#2501).
const averageHandler = overNumbers(computeAverage);

const maxHandler = overNumbers((values) => (values.length > 0 ? Math.max(...values) : 0));

const minHandler = overNumbers((values) => (values.length > 0 ? Math.min(...values) : 0));

// COUNT counts NUMBERS, so it cannot go through the lenient numeric collection
// the other aggregates share: `toNumber("text")` is 0, which made COUNT("text")
// answer 1 where Excel answers 0 (Codex review). A range cell reached the list
// only by being numeric already; a scalar has to be asked.
const countsAsNumber = ({ value, isScalar }: ArgumentValue): boolean => !isScalar || holdsNumber(value);

const countHandler: FunctionHandler = (args, context) => collectArgumentValues(args, context, context.getRangeValues).filter(countsAsNumber).length;

const medianHandler = overNumbers(computeMedian);

const modeHandler = overNumbers(computeMode);

const stdevHandler = overNumbers(sampleStdev);

const varHandler = overNumbers(sampleVariance);

const isFilledValue = (value: CellValue): boolean => value !== null && value !== undefined && value !== "";

/** COUNTA of one argument: the filled cells of a reference, or 1 for a non-empty scalar. A host
 *  without `countFilledCells` reads the reference's values, which cannot tell a formula's ""
 *  from a blank. */
const countaOf = (arg: string, context: FunctionContext): number => {
  if (isReference(arg) && context.countFilledCells) return context.countFilledCells(arg);
  return collectRawValues([arg], context).filter(isFilledValue).length;
};

const countaHandler: FunctionHandler = (args, context) =>
  args.reduce((count, rawArg) => {
    const arg = rawArg?.trim();
    return arg ? count + countaOf(arg, context) : count;
  }, 0);

const countifHandler: FunctionHandler = (args, context) => {
  const values = blankAwareRangeReader(context)(requiredArg(context, args, 0));
  const matches = criteriaArg(context, args, 1);
  return typeof matches === "function" ? values.filter(matches).length : matches;
};

/** The criteria range, the matcher and the value range SUMIF and AVERAGEIF both
 *  read. Both value ranges are RAW, not numeric-only: dropping blanks would
 *  shift the value range out of alignment with the (raw) criteria range, so a
 *  blank would pull a later row's number into an earlier match (#2358). */
const readConditionalRanges = (args: string[], context: FunctionContext) => {
  const criteriaRef = requiredArg(context, args, 0);
  const readRaw = blankAwareRangeReader(context);
  const valueRef = args.length === 3 ? requiredArg(context, args, 2) : criteriaRef;
  return {
    criteriaRange: readRaw(criteriaRef),
    valueRange: readRaw(valueRef),
    matches: criteriaArg(context, args, 1),
  };
};

interface MatchedTotals {
  sum: number;
  count: number;
  /** The first matched value that is an error, which is then the answer, as in Excel. */
  error?: SpreadsheetError;
}

/** Sum the values whose row in `criteriaRange` matches, and count the matched values that are
 *  numbers. The two ranges stay row-aligned, so a matched row with no number adds 0 to the sum
 *  and nothing to the count: AVERAGEIF skips a blank or text value as Excel does. An error in an
 *  unmatched row, or in the criteria range, is not read. */
const aggregateMatchedRows = (criteriaRange: CellValue[], valueRange: CellValue[], matches: (value: CellValue) => boolean): MatchedTotals => {
  const none: MatchedTotals = { sum: 0, count: 0 };
  return criteriaRange.reduce((totals, criteriaValue, index) => {
    if (!matches(criteriaValue)) return totals;
    const value = valueRange[index] ?? "";
    if (isSpreadsheetErrorValue(value)) return { ...totals, error: totals.error ?? value };
    return { ...totals, sum: totals.sum + toNumber(value), count: totals.count + (holdsNumber(value) ? 1 : 0) };
  }, none);
};

const sumifHandler: FunctionHandler = (args, context) => {
  const { criteriaRange, valueRange, matches } = readConditionalRanges(args, context);
  if (typeof matches !== "function") return matches;
  const { sum, error } = aggregateMatchedRows(criteriaRange, valueRange, matches);
  return error ?? sum;
};

const averageifHandler: FunctionHandler = (args, context) => {
  const { criteriaRange, valueRange, matches } = readConditionalRanges(args, context);
  if (typeof matches !== "function") return matches;
  const { sum, count, error } = aggregateMatchedRows(criteriaRange, valueRange, matches);
  if (error) return error;
  // Excel returns #DIV/0! when no cell matches (the average of nothing is
  // undefined), rather than a silent 0.
  return count > 0 ? sum / count : DIV_ZERO_ERROR;
};

// Register all statistical functions
functionRegistry.register({
  name: "SUM",
  handler: sumHandler,
  minArgs: 1,
  maxArgs: MAX_AGGREGATE_ARGS,
  description: "Returns the sum of all numbers in a range",
  examples: ["SUM(A1:A10)", "SUM(B2:B20)"],
  category: "Statistical",
});

functionRegistry.register({
  name: "AVERAGE",
  handler: averageHandler,
  minArgs: 1,
  maxArgs: MAX_AGGREGATE_ARGS,
  description: "Returns the average (arithmetic mean) of numbers in a range",
  examples: ["AVERAGE(A1:A10)", "AVERAGE(B2:B20)"],
  category: "Statistical",
});

functionRegistry.register({
  name: "MAX",
  handler: maxHandler,
  minArgs: 1,
  description: "Returns the largest value in a range",
  examples: ["MAX(A1:A10)", "MAX(B2:B20)"],
  category: "Statistical",
});

functionRegistry.register({
  name: "MIN",
  handler: minHandler,
  minArgs: 1,
  description: "Returns the smallest value in a range",
  examples: ["MIN(A1:A10)", "MIN(B2:B20)"],
  category: "Statistical",
});

functionRegistry.register({
  name: "COUNT",
  handler: countHandler,
  minArgs: 1,
  maxArgs: MAX_AGGREGATE_ARGS,
  description: "Counts the number of cells in a range",
  examples: ["COUNT(A1:A10)", "COUNT(B2:B20)"],
  category: "Statistical",
});

functionRegistry.register({
  name: "MEDIAN",
  handler: medianHandler,
  minArgs: 1,
  maxArgs: MAX_AGGREGATE_ARGS,
  description: "Returns the median (middle) value in a range",
  examples: ["MEDIAN(A1:A10)", "MEDIAN(B2:B20)"],
  category: "Statistical",
});

functionRegistry.register({
  name: "MODE",
  handler: modeHandler,
  minArgs: 1,
  maxArgs: MAX_AGGREGATE_ARGS,
  description: "Returns the most frequently occurring value in a range",
  examples: ["MODE(A1:A10)", "MODE(B2:B20)"],
  category: "Statistical",
});

functionRegistry.register({
  name: "STDEV",
  handler: stdevHandler,
  minArgs: 1,
  maxArgs: MAX_AGGREGATE_ARGS,
  description: "Returns the standard deviation of numbers in a range",
  examples: ["STDEV(A1:A10)", "STDEV(B2:B20)"],
  category: "Statistical",
});

functionRegistry.register({
  name: "VAR",
  handler: varHandler,
  minArgs: 1,
  maxArgs: MAX_AGGREGATE_ARGS,
  description: "Returns the variance of numbers in a range",
  examples: ["VAR(A1:A10)", "VAR(B2:B20)"],
  category: "Statistical",
});

functionRegistry.register({
  name: "COUNTA",
  handler: countaHandler,
  minArgs: 1,
  maxArgs: MAX_AGGREGATE_ARGS,
  description: "Counts the number of non-empty cells in a range",
  examples: ["COUNTA(A1:A10)", "COUNTA(B2:B20)"],
  category: "Statistical",
});

functionRegistry.register({
  name: "COUNTIF",
  handler: countifHandler,
  minArgs: 2,
  maxArgs: 2,
  description: "Counts cells in a range that match a criteria",
  examples: ['COUNTIF(A1:A10, ">5")', 'COUNTIF(B1:B10, "Yes")'],
  category: "Statistical",
});

functionRegistry.register({
  name: "SUMIF",
  handler: sumifHandler,
  minArgs: 2,
  maxArgs: 3,
  description: "Sums cells in a range that match a criteria",
  examples: ['SUMIF(A1:A10, ">5")', 'SUMIF(A1:A10, ">5", B1:B10)'],
  category: "Statistical",
});

functionRegistry.register({
  name: "AVERAGEIF",
  handler: averageifHandler,
  minArgs: 2,
  maxArgs: 3,
  description: "Averages cells in a range that match a criteria",
  examples: ['AVERAGEIF(A1:A10, ">5")', 'AVERAGEIF(A1:A10, ">5", B1:B10)'],
  category: "Statistical",
});
