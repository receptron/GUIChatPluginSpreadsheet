/**
 * The remaining descriptive statistics: TRIMMEAN, AVEDEV, DEVSQ, SKEW.P, PERCENTILE.EXC,
 * QUARTILE.EXC, PERCENTRANK.EXC, RANK.AVG, PROB, COUNTBLANK, AVERAGEA, MAXA, MINA, and the rank
 * correlations SPEARMAN and KENDALL. The rules live in descriptive-math.ts.
 */

import { blankAwareRangeReader, functionRegistry, requiredArg, type FunctionContext, type FunctionHandler } from "../registry";
import { toScalarNumber } from "../numericCoercion";
import { DIV_ZERO_ERROR, isSpreadsheetErrorValue, type SpreadsheetError } from "../spreadsheet-errors";
import type { CellValue } from "../types";
import { collectArgumentValues, collectNumbersOrError, overNumbers } from "./statistical";
import { pairedHandler, pairsFrom, scalarArg } from "./statistical-analysis";
import {
  averageDeviation,
  averageRank,
  kendall,
  percentileExclusive,
  percentRankExclusive,
  populationSkewness,
  probability,
  quartileExclusive,
  spearman,
  squaredDeviations,
  trimmedMean,
} from "./descriptive-math";

const MAX_AGGREGATE_ARGS = 255;
const DEFAULT_SIGNIFICANCE = 3;

/** `(range, k)`: the numbers in the range, read first, and then k as a number. */
const rangeAndNumber =
  (rule: (values: number[], k: number) => number | SpreadsheetError): FunctionHandler =>
  (args, context) => {
    const values = collectNumbersOrError([requiredArg(context, args, 0)], context);
    if (!Array.isArray(values)) return values;
    const k = scalarArg(args, context, 1);
    return typeof k === "number" ? rule(values, k) : k;
  };

const percentRankExclusiveHandler: FunctionHandler = (args, context) => {
  const values = collectNumbersOrError([requiredArg(context, args, 0)], context);
  if (!Array.isArray(values)) return values;
  const x = scalarArg(args, context, 1);
  if (typeof x !== "number") return x;
  const significance = args.length > 2 ? scalarArg(args, context, 2) : DEFAULT_SIGNIFICANCE;
  return typeof significance === "number" ? percentRankExclusive(values, x, significance) : significance;
};

const averageRankHandler: FunctionHandler = (args, context) => {
  const target = scalarArg(args, context, 0);
  if (typeof target !== "number") return target;
  const values = collectNumbersOrError([requiredArg(context, args, 1)], context);
  if (!Array.isArray(values)) return values;
  const order = args.length > 2 ? scalarArg(args, context, 2) : 0;
  return typeof order === "number" ? averageRank(target, values, order !== 0) : order;
};

/** PROB(x_range, prob_range, lower, [upper]): the pairs, then the bounds; without an upper bound,
 *  the probability of exactly `lower`. */
const probabilityHandler: FunctionHandler = (args, context) => {
  const pairs = pairsFrom(args, context);
  if (!("ys" in pairs)) return pairs;
  const lower = scalarArg(args, context, 2);
  if (typeof lower !== "number") return lower;
  const upper = args.length > 3 ? scalarArg(args, context, 3) : lower;
  return typeof upper === "number" ? probability(pairs, lower, upper) : upper;
};

/** COUNTBLANK: the cells of a range that hold nothing, a formula that answered "" included. */
const countBlankHandler: FunctionHandler = (args, context) =>
  blankAwareRangeReader(context)(requiredArg(context, args, 0)).filter((value) => value === "").length;

/** One collected value as AVERAGEA, MAXA and MINA count it: in a range, text counts as 0 and a
 *  logical value as 1 or 0, and a blank is skipped; written as an argument, it is read as SUM
 *  reads one. */
const countingText = ({ value, isScalar }: { value: CellValue; isScalar: boolean }): (number | SpreadsheetError)[] => {
  if (isSpreadsheetErrorValue(value)) return [value];
  if (isScalar) return [toScalarNumber(value)];
  if (value === "") return [];
  if (typeof value === "boolean") return [value ? 1 : 0];
  return [typeof value === "number" ? value : 0];
};

const overValuesCountingText =
  (rule: (values: number[]) => CellValue): FunctionHandler =>
  (args, context: FunctionContext) => {
    const read = collectArgumentValues(args, context, blankAwareRangeReader(context)).flatMap(countingText);
    const firstError = read.find(isSpreadsheetErrorValue);
    return firstError ?? rule(read.filter((value): value is number => typeof value === "number"));
  };

const averageA = (values: number[]): CellValue => (values.length === 0 ? DIV_ZERO_ERROR : values.reduce((sum, value) => sum + value, 0) / values.length);

interface DescriptiveFunction {
  name: string;
  handler: FunctionHandler;
  minArgs: number;
  maxArgs: number;
  description: string;
  examples: string[];
}

const DESCRIPTIVE_FUNCTIONS: DescriptiveFunction[] = [
  {
    name: "TRIMMEAN",
    handler: rangeAndNumber(trimmedMean),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the mean of the values with a share of the largest and smallest left out",
    examples: ["TRIMMEAN(A2:A100, 0.2)"],
  },
  {
    name: "AVEDEV",
    handler: overNumbers(averageDeviation),
    minArgs: 1,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the mean absolute deviation from the mean",
    examples: ["AVEDEV(A2:A100)"],
  },
  {
    name: "DEVSQ",
    handler: overNumbers(squaredDeviations),
    minArgs: 1,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the sum of squared deviations from the mean",
    examples: ["DEVSQ(A2:A100)"],
  },
  {
    name: "SKEW.P",
    handler: overNumbers(populationSkewness),
    minArgs: 1,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the skewness of a population",
    examples: ["SKEW.P(A2:A100)"],
  },
  {
    name: "PERCENTILE.EXC",
    handler: rangeAndNumber(percentileExclusive),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the k-th percentile, k strictly between 0 and 1, excluding the ends",
    examples: ["PERCENTILE.EXC(A2:A100, 0.9)"],
  },
  {
    name: "QUARTILE.EXC",
    handler: rangeAndNumber(quartileExclusive),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns a quartile (1 to 3), interpolated like PERCENTILE.EXC",
    examples: ["QUARTILE.EXC(A2:A100, 1)"],
  },
  {
    name: "PERCENTRANK.EXC",
    handler: percentRankExclusiveHandler,
    minArgs: 2,
    maxArgs: 3,
    description: "Returns the rank of a value as a share strictly between 0 and 1",
    examples: ["PERCENTRANK.EXC(A2:A100, 42)"],
  },
  {
    name: "RANK.AVG",
    handler: averageRankHandler,
    minArgs: 2,
    maxArgs: 3,
    description: "Returns the rank of a number, tied values sharing the mean of their ranks",
    examples: ["RANK.AVG(A2, A2:A100)", "RANK.AVG(A2, A2:A100, 1)"],
  },
  {
    name: "PROB",
    handler: probabilityHandler,
    minArgs: 3,
    maxArgs: 4,
    description: "Returns the probability that a value lies between two bounds",
    examples: ["PROB(A2:A7, B2:B7, 2, 4)"],
  },
  {
    name: "COUNTBLANK",
    handler: countBlankHandler,
    minArgs: 1,
    maxArgs: 1,
    description: "Counts the empty cells in a range",
    examples: ["COUNTBLANK(A2:A100)"],
  },
  {
    name: "AVERAGEA",
    handler: overValuesCountingText(averageA),
    minArgs: 1,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the average, counting text as 0 and TRUE as 1",
    examples: ["AVERAGEA(A2:A100)"],
  },
  {
    name: "MAXA",
    handler: overValuesCountingText((values) => (values.length > 0 ? values.reduce((largest, value) => Math.max(largest, value)) : 0)),
    minArgs: 1,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the largest value, counting text as 0 and TRUE as 1",
    examples: ["MAXA(A2:A100)"],
  },
  {
    name: "MINA",
    handler: overValuesCountingText((values) => (values.length > 0 ? values.reduce((smallest, value) => Math.min(smallest, value)) : 0)),
    minArgs: 1,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the smallest value, counting text as 0 and TRUE as 1",
    examples: ["MINA(A2:A100)"],
  },
  {
    name: "SPEARMAN",
    handler: pairedHandler(spearman),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns Spearman's rank correlation of two ranges",
    examples: ["SPEARMAN(A2:A20, B2:B20)"],
  },
  {
    name: "KENDALL",
    handler: pairedHandler(kendall),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns Kendall's tau-b rank correlation of two ranges",
    examples: ["KENDALL(A2:A20, B2:B20)"],
  },
];

DESCRIPTIVE_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Statistical" }));
