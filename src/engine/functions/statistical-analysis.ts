/**
 * Analysis functions: correlation and regression, percentiles and ranks,
 * population spread, and the multi-condition aggregates. The rules live in
 * analysis-math.ts; this file reads the ranges and registers the names.
 */

import { blankAwareRangeReader, criteriaArg, functionRegistry, requiredArg, toNumber, type FunctionContext, type FunctionHandler } from "../registry";
import { collectNumericValues } from "./statistical";
import {
  correlation,
  intercept,
  kthLargest,
  kthSmallest,
  numericPairs,
  percentileInclusive,
  populationStdev,
  populationVariance,
  quartileInclusive,
  rankOf,
  rowsMeetingAll,
  rSquared,
  slope,
  type NumericPairs,
  type RangeCondition,
} from "./analysis-math";
import { holdsNumber, toScalarNumber } from "../numericCoercion";
import { DIV_ZERO_ERROR, isSpreadsheetErrorValue, type SpreadsheetError } from "../spreadsheet-errors";
import type { CellValue } from "../types";

const MAX_AGGREGATE_ARGS = 255;

/** A scalar argument as a number, or the error it evaluated to (`#VALUE!` for text). */
export const scalarArg = (args: string[], context: FunctionContext, index: number): number | SpreadsheetError =>
  toScalarNumber(context.evaluateFormula(requiredArg(context, args, index)));

/** `(known_y, known_x)` from argument `first` on, read raw so the two ranges stay paired by position. */
export const pairsFrom = (args: string[], context: FunctionContext, first = 0): NumericPairs | SpreadsheetError => {
  const readRaw = blankAwareRangeReader(context);
  return numericPairs(readRaw(requiredArg(context, args, first)), readRaw(requiredArg(context, args, first + 1)));
};

export const pairedHandler =
  (rule: (pairs: NumericPairs) => number | SpreadsheetError): FunctionHandler =>
  (args, context) => {
    const pairs = pairsFrom(args, context);
    return "ys" in pairs ? rule(pairs) : pairs;
  };

/** `(range, k)`: the numbers in the range, and k evaluated as a scalar. */
const rankedHandler =
  (rule: (values: number[], k: number) => number | SpreadsheetError): FunctionHandler =>
  (args, context) => {
    const k = scalarArg(args, context, 1);
    return typeof k === "number" ? rule(collectNumericValues([requiredArg(context, args, 0)], context), k) : k;
  };

const rankHandler: FunctionHandler = (args, context) => {
  const target = scalarArg(args, context, 0);
  if (typeof target !== "number") return target;
  const order = args.length > 2 ? scalarArg(args, context, 2) : 0;
  if (typeof order !== "number") return order;
  return rankOf(target, collectNumericValues([requiredArg(context, args, 1)], context), order !== 0);
};

/** The `range, criteria` pairs starting at `first`, or the first error a
 *  criteria evaluated to. A range without its criteria is an arity error,
 *  raised by `requiredArg`. */
const conditionsFrom = (args: string[], context: FunctionContext, first: number): RangeCondition[] | SpreadsheetError => {
  const readRaw = blankAwareRangeReader(context);
  const pairStarts = Array.from({ length: Math.ceil((args.length - first) / 2) }, (_, index) => first + index * 2);
  const conditions = pairStarts.map((start) => ({ range: readRaw(requiredArg(context, args, start)), matches: criteriaArg(context, args, start + 1) }));
  const firstError = conditions.map(({ matches }) => matches).find(isSpreadsheetErrorValue);
  if (firstError) return firstError;
  return conditions.flatMap(({ range, matches }) => (typeof matches === "function" ? [{ range, matches }] : []));
};

/** The rows of the value range (argument 0) that meet every condition after it. */
const matchedValues = (args: string[], context: FunctionContext): CellValue[] | SpreadsheetError => {
  const values = blankAwareRangeReader(context)(requiredArg(context, args, 0));
  const conditions = conditionsFrom(args, context, 1);
  if (!Array.isArray(conditions)) return conditions;
  const matched = rowsMeetingAll(values.length, conditions);
  return Array.isArray(matched) ? values.filter((_, row) => matched[row]) : matched;
};

const sumifsHandler: FunctionHandler = (args, context) => {
  const values = matchedValues(args, context);
  return Array.isArray(values) ? values.reduce((sum: number, value) => sum + toNumber(value), 0) : values;
};

// AVERAGEIFS skips a matched cell that holds no number rather than counting it
// as 0, and answers #DIV/0! when nothing is left to average.
const averageifsHandler: FunctionHandler = (args, context) => {
  const values = matchedValues(args, context);
  if (!Array.isArray(values)) return values;
  const numbers = values.filter(holdsNumber).map(toNumber);
  return numbers.length > 0 ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : DIV_ZERO_ERROR;
};

/** MAXIFS / MINIFS: the extreme of the matched values that hold a number, or 0 when none do. */
const extremeIfsHandler =
  (pick: (left: number, right: number) => number): FunctionHandler =>
  (args, context) => {
    const values = matchedValues(args, context);
    if (!Array.isArray(values)) return values;
    const numbers = values.filter(holdsNumber).map(toNumber);
    return numbers.length > 0 ? numbers.reduce((extreme, value) => pick(extreme, value)) : 0;
  };

const countifsHandler: FunctionHandler = (args, context) => {
  const conditions = conditionsFrom(args, context, 0);
  if (!Array.isArray(conditions)) return conditions;
  const matched = rowsMeetingAll(conditions[0]?.range.length ?? 0, conditions);
  return Array.isArray(matched) ? matched.filter(Boolean).length : matched;
};

interface AnalysisFunction {
  name: string;
  handler: FunctionHandler;
  minArgs: number;
  maxArgs: number;
  description: string;
  examples: string[];
}

const ANALYSIS_FUNCTIONS: AnalysisFunction[] = [
  {
    name: "CORREL",
    handler: pairedHandler(correlation),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the correlation coefficient of two ranges",
    examples: ["CORREL(A2:A20, B2:B20)"],
  },
  {
    name: "SLOPE",
    handler: pairedHandler(slope),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the slope of the least-squares line through known_y and known_x",
    examples: ["SLOPE(B2:B20, A2:A20)"],
  },
  {
    name: "INTERCEPT",
    handler: pairedHandler(intercept),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns where the least-squares line crosses the y axis",
    examples: ["INTERCEPT(B2:B20, A2:A20)"],
  },
  {
    name: "RSQ",
    handler: pairedHandler(rSquared),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the square of the correlation coefficient",
    examples: ["RSQ(B2:B20, A2:A20)"],
  },
  {
    name: "PERCENTILE",
    handler: rankedHandler(percentileInclusive),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the k-th percentile (k from 0 to 1), interpolated like PERCENTILE.INC",
    examples: ["PERCENTILE(A2:A100, 0.9)"],
  },
  {
    name: "QUARTILE",
    handler: rankedHandler(quartileInclusive),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns a quartile (0 to 4), interpolated like QUARTILE.INC",
    examples: ["QUARTILE(A2:A100, 1)"],
  },
  { name: "LARGE", handler: rankedHandler(kthLargest), minArgs: 2, maxArgs: 2, description: "Returns the k-th largest value", examples: ["LARGE(A2:A100, 3)"] },
  {
    name: "SMALL",
    handler: rankedHandler(kthSmallest),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the k-th smallest value",
    examples: ["SMALL(A2:A100, 3)"],
  },
  {
    name: "RANK",
    handler: rankHandler,
    minArgs: 2,
    maxArgs: 3,
    description: "Returns the rank of a number in a range (largest first unless order is non-zero)",
    examples: ["RANK(A2, A2:A100)", "RANK(A2, A2:A100, 1)"],
  },
  {
    name: "STDEVP",
    handler: (args, context) => populationStdev(collectNumericValues(args, context)),
    minArgs: 1,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the population standard deviation",
    examples: ["STDEVP(A2:A100)"],
  },
  {
    name: "VARP",
    handler: (args, context) => populationVariance(collectNumericValues(args, context)),
    minArgs: 1,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the population variance",
    examples: ["VARP(A2:A100)"],
  },
  {
    name: "SUMIFS",
    handler: sumifsHandler,
    minArgs: 3,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Sums the cells whose rows meet every condition",
    examples: ['SUMIFS(C2:C100, A2:A100, "East", B2:B100, ">10")'],
  },
  {
    name: "COUNTIFS",
    handler: countifsHandler,
    minArgs: 2,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Counts the rows that meet every condition",
    examples: ['COUNTIFS(A2:A100, "East", B2:B100, ">10")'],
  },
  {
    name: "MAXIFS",
    handler: extremeIfsHandler(Math.max),
    minArgs: 3,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the largest value whose row meets every condition (0 when none does)",
    examples: ['MAXIFS(C2:C100, A2:A100, "East")'],
  },
  {
    name: "MINIFS",
    handler: extremeIfsHandler(Math.min),
    minArgs: 3,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the smallest value whose row meets every condition (0 when none does)",
    examples: ['MINIFS(C2:C100, A2:A100, "East")'],
  },
  {
    name: "AVERAGEIFS",
    handler: averageifsHandler,
    minArgs: 3,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Averages the cells whose rows meet every condition",
    examples: ['AVERAGEIFS(C2:C100, A2:A100, "East")'],
  },
];

ANALYSIS_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Statistical" }));
