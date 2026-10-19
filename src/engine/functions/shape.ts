/**
 * SKEW, KURT, STANDARDIZE, PERCENTRANK.INC, GEOMEAN and HARMEAN: the numbers of their arguments
 * read as SUM reads them, and the rules in shape-math.ts.
 */

import { functionRegistry, rawRangeReader, requiredArg, type FunctionContext, type FunctionHandler } from "../registry";
import { toScalarNumber } from "../numericCoercion";
import { isSpreadsheetErrorValue, type SpreadsheetError } from "../spreadsheet-errors";
import { collectArgumentValues, collectNumericValues } from "./statistical";
import { geometricMean, harmonicMean, kurtosis, percentRank, skewness, standardize } from "./shape-math";

const MAX_AGGREGATE_ARGS = 255;
const DEFAULT_SIGNIFICANCE = 3;

const numberArg = (args: string[], context: FunctionContext, index: number): number | SpreadsheetError =>
  toScalarNumber(context.evaluateFormula(requiredArg(context, args, index)));

/** The numbers of the arguments, as SUM reads them, or the first error among them in argument
 *  order — a cell inside a range or a scalar. SUM's reader skips an error cell and reads an
 *  error scalar as 0, so a sample with #DIV/0! in it answered as if it were shorter. */
function sampleOrError(args: string[], context: FunctionContext): number[] | SpreadsheetError {
  const firstError = collectArgumentValues(args, context, rawRangeReader(context))
    .map(({ value }) => value)
    .find(isSpreadsheetErrorValue);
  return firstError ?? collectNumericValues(args, context);
}

const sampleHandler =
  (rule: (values: number[]) => number | SpreadsheetError): FunctionHandler =>
  (args, context) => {
    const values = sampleOrError(args, context);
    return Array.isArray(values) ? rule(values) : values;
  };

const standardizeHandler: FunctionHandler = (args, context) => {
  const values = [0, 1, 2].map((index) => numberArg(args, context, index));
  const firstError = values.find((value): value is SpreadsheetError => typeof value !== "number");
  if (firstError) return firstError;
  const [x = 0, center = 0, sd = 0] = values.map(Number);
  return standardize(x, center, sd);
};

const percentRankHandler: FunctionHandler = (args, context) => {
  const x = numberArg(args, context, 1);
  if (typeof x !== "number") return x;
  const significance = args.length > 2 ? numberArg(args, context, 2) : DEFAULT_SIGNIFICANCE;
  if (typeof significance !== "number") return significance;
  const values = sampleOrError([requiredArg(context, args, 0)], context);
  return Array.isArray(values) ? percentRank(values, x, significance) : values;
};

interface ShapeFunction {
  name: string;
  handler: FunctionHandler;
  minArgs: number;
  maxArgs: number;
  description: string;
  examples: string[];
}

const SHAPE_FUNCTIONS: ShapeFunction[] = [
  {
    name: "SKEW",
    handler: sampleHandler(skewness),
    minArgs: 1,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the skewness of a sample",
    examples: ["SKEW(A2:A100)"],
  },
  {
    name: "KURT",
    handler: sampleHandler(kurtosis),
    minArgs: 1,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the excess kurtosis of a sample",
    examples: ["KURT(A2:A100)"],
  },
  {
    name: "STANDARDIZE",
    handler: standardizeHandler,
    minArgs: 3,
    maxArgs: 3,
    description: "Returns (x - mean) / standard deviation",
    examples: ["STANDARDIZE(A2, AVERAGE(A2:A100), STDEV(A2:A100))"],
  },
  {
    name: "PERCENTRANK.INC",
    handler: percentRankHandler,
    minArgs: 2,
    maxArgs: 3,
    description: "Returns the rank of x in a range as a fraction from 0 to 1, to significance digits (3 by default)",
    examples: ["PERCENTRANK.INC(A2:A100, A2)"],
  },
  {
    name: "GEOMEAN",
    handler: sampleHandler(geometricMean),
    minArgs: 1,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the geometric mean of positive numbers",
    examples: ["GEOMEAN(A2:A20)"],
  },
  {
    name: "HARMEAN",
    handler: sampleHandler(harmonicMean),
    minArgs: 1,
    maxArgs: MAX_AGGREGATE_ARGS,
    description: "Returns the harmonic mean of positive numbers",
    examples: ["HARMEAN(A2:A20)"],
  },
];

SHAPE_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Statistical" }));
