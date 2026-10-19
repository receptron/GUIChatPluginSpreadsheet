/**
 * The t and normal distributions, the t-test and confidence intervals. The numerics live in
 * distribution-math.ts; this file reads the arguments, applies Excel's argument rules —
 * degrees of freedom, tails, type and size truncated to integers, anything out of range
 * #NUM! — and registers the names.
 */

import { blankAwareRangeReader, functionRegistry, rawRangeReader, requiredArg, type FunctionContext, type FunctionHandler } from "../registry";
import { coerceToBoolean } from "../coerce-boolean";
import { toScalarNumber } from "../numericCoercion";
import { DIV_ZERO_ERROR, isSpreadsheetErrorValue, NUM_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import { collectNumericValues } from "./statistical";
import { numericPairs } from "./analysis-math";
import {
  normalCdf,
  normalDensity,
  normalQuantile,
  normalUpperQuantile,
  pairedT,
  pooledT,
  studentCdf,
  studentDensity,
  studentQuantile,
  studentUpperQuantile,
  studentUpperTail,
  summarize,
  tTestProbability,
  welchT,
  type TStatistic,
} from "./distribution-math";

type Result = number | SpreadsheetError;

/** The argument at `index` as a number, or the error it evaluated to. */
const numberArg = (args: string[], context: FunctionContext, index: number): Result =>
  toScalarNumber(context.evaluateFormula(requiredArg(context, args, index)));

/** The argument at `index` read as Excel's truthiness, or the error it evaluated to: coerced
 *  first, an error cell would read as TRUE and the formula answer as if it were fine. */
function booleanArg(args: string[], context: FunctionContext, index: number): boolean | SpreadsheetError {
  const value = context.evaluateFormula(requiredArg(context, args, index));
  return isSpreadsheetErrorValue(value) ? value : coerceToBoolean(value);
}

/** The arguments as numbers, or the first error among them, in argument order. */
function numberArgs(args: string[], context: FunctionContext, count: number): number[] | SpreadsheetError {
  const values = Array.from({ length: count }, (_, index) => numberArg(args, context, index));
  const firstError = values.find((value): value is SpreadsheetError => typeof value !== "number");
  return firstError ?? values.filter((value): value is number => typeof value === "number");
}

/** A handler over `count` numeric arguments; `rule` answers #NUM! for what Excel rejects. */
const numericHandler =
  (count: number, rule: (values: number[]) => Result): FunctionHandler =>
  (args, context) => {
    const values = numberArgs(args, context, count);
    return Array.isArray(values) ? rule(values) : values;
  };

/** Degrees of freedom, truncated as Excel does; below 1 has no distribution. */
const degreesOfFreedom = (value: number): number | null => {
  const df = Math.trunc(value);
  return df >= 1 ? df : null;
};

const isOpenProbability = (p: number): boolean => p > 0 && p < 1;

// ---------------------------------------------------------------- t distribution

const tDist: FunctionHandler = (args, context) => {
  const values = numberArgs(args, context, 2);
  if (!Array.isArray(values)) return values;
  const [x = 0, rawDf = 0] = values;
  const cumulative = booleanArg(args, context, 2);
  if (typeof cumulative !== "boolean") return cumulative;
  const df = degreesOfFreedom(rawDf);
  if (df === null) return NUM_ERROR;
  return cumulative ? studentCdf(x, df) : studentDensity(x, df);
};

const tDistTwoTailed = ([x = 0, rawDf = 0]: number[]): Result => {
  const df = degreesOfFreedom(rawDf);
  return df === null || x < 0 ? NUM_ERROR : 2 * studentUpperTail(x, df);
};

const tDistRightTailed = ([x = 0, rawDf = 0]: number[]): Result => {
  const df = degreesOfFreedom(rawDf);
  return df === null ? NUM_ERROR : studentUpperTail(x, df);
};

const tInv = ([p = 0, rawDf = 0]: number[]): Result => {
  const df = degreesOfFreedom(rawDf);
  return df === null || !isOpenProbability(p) ? NUM_ERROR : studentQuantile(p, df);
};

// Two-tailed: the t whose two tails together hold p; p = 1 leaves an upper tail of ½, at t = 0.
const tInvTwoTailed = ([p = 0, rawDf = 0]: number[]): Result => {
  const df = degreesOfFreedom(rawDf);
  return df === null || p <= 0 || p > 1 ? NUM_ERROR : studentUpperQuantile(p / 2, df);
};

// ---------------------------------------------------------------- t-test

const PAIRED = 1;
const EQUAL_VARIANCE = 2;
const UNEQUAL_VARIANCE = 3;

/** The paired t: the rows where both ranges hold a number, differenced. A blank reads as "", not
 *  0, so its row drops out as it does from CORREL. */
function pairedStatistic(args: string[], context: FunctionContext): TStatistic | SpreadsheetError {
  const readRaw = blankAwareRangeReader(context);
  const pairs = numericPairs(readRaw(requiredArg(context, args, 0)), readRaw(requiredArg(context, args, 1)));
  return "ys" in pairs ? pairedT(pairs.ys.map((y, index) => y - (pairs.xs[index] ?? 0))) : pairs;
}

/** The two-sample t, pooled or Welch, over the numbers of each range. */
function twoSampleStatistic(args: string[], context: FunctionContext, type: number): TStatistic | SpreadsheetError {
  const first = collectNumericValues([requiredArg(context, args, 0)], context);
  const second = collectNumericValues([requiredArg(context, args, 1)], context);
  return type === EQUAL_VARIANCE ? pooledT(summarize(first), summarize(second)) : welchT(summarize(first), summarize(second));
}

/** A statistic that does not come out finite — fewer than two values, or a sample that never
 *  varies, leaves 0 / 0 — answers #DIV/0!, as Excel does. */
const finiteStatistic = (statistic: TStatistic | SpreadsheetError): TStatistic | SpreadsheetError =>
  "t" in statistic && !(Number.isFinite(statistic.t) && Number.isFinite(statistic.df)) ? DIV_ZERO_ERROR : statistic;

/** The first error cell in the two sample ranges, in argument order. Excel's T.TEST answers it;
 *  the numeric readers below skip any cell without a number, errors included. */
function sampleRangeError(args: string[], context: FunctionContext): SpreadsheetError | undefined {
  const readRaw = rawRangeReader(context);
  return [0, 1].flatMap((index) => readRaw(requiredArg(context, args, index))).find(isSpreadsheetErrorValue);
}

const tTest: FunctionHandler = (args, context) => {
  const rangeError = sampleRangeError(args, context);
  if (rangeError) return rangeError;
  const tailsAndType = [numberArg(args, context, 2), numberArg(args, context, 3)];
  const firstError = tailsAndType.find((value): value is SpreadsheetError => typeof value !== "number");
  if (firstError) return firstError;
  const [tails, type] = tailsAndType.map((value) => Math.trunc(Number(value)));
  if ((tails !== 1 && tails !== 2) || type === undefined || type < PAIRED || type > UNEQUAL_VARIANCE) return NUM_ERROR;
  const statistic = finiteStatistic(type === PAIRED ? pairedStatistic(args, context) : twoSampleStatistic(args, context, type));
  return "t" in statistic ? tTestProbability(statistic, tails === 1 ? 1 : 2) : statistic;
};

// ---------------------------------------------------------------- normal distribution

const normDist: FunctionHandler = (args, context) => {
  const values = numberArgs(args, context, 3);
  if (!Array.isArray(values)) return values;
  const [x = 0, mean = 0, sd = 0] = values;
  const cumulative = booleanArg(args, context, 3);
  if (typeof cumulative !== "boolean") return cumulative;
  if (sd <= 0) return NUM_ERROR;
  const z = (x - mean) / sd;
  return cumulative ? normalCdf(z) : normalDensity(z) / sd;
};

const normStandardDist: FunctionHandler = (args, context) => {
  const z = numberArg(args, context, 0);
  if (typeof z !== "number") return z;
  const cumulative = booleanArg(args, context, 1);
  if (typeof cumulative !== "boolean") return cumulative;
  return cumulative ? normalCdf(z) : normalDensity(z);
};

const normInv = ([p = 0, mean = 0, sd = 0]: number[]): Result => (!isOpenProbability(p) || sd <= 0 ? NUM_ERROR : mean + sd * normalQuantile(p));

const normStandardInv = ([p = 0]: number[]): Result => (isOpenProbability(p) ? normalQuantile(p) : NUM_ERROR);

// ---------------------------------------------------------------- confidence intervals

/** alpha, standard deviation and sample size checked as Excel checks them; size truncated. */
function confidenceArguments([alpha = 0, sd = 0, rawSize = 0]: number[]): { alpha: number; sd: number; size: number } | SpreadsheetError {
  const size = Math.trunc(rawSize);
  return !isOpenProbability(alpha) || sd <= 0 || size < 1 ? NUM_ERROR : { alpha, sd, size };
}

const confidenceNorm = (values: number[]): Result => {
  const checked = confidenceArguments(values);
  return "size" in checked ? (normalUpperQuantile(checked.alpha / 2) * checked.sd) / Math.sqrt(checked.size) : checked;
};

const confidenceT = (values: number[]): Result => {
  const checked = confidenceArguments(values);
  if (!("size" in checked)) return checked;
  if (checked.size === 1) return DIV_ZERO_ERROR;
  return (studentUpperQuantile(checked.alpha / 2, checked.size - 1) * checked.sd) / Math.sqrt(checked.size);
};

interface DistributionFunction {
  name: string;
  handler: FunctionHandler;
  minArgs: number;
  maxArgs: number;
  description: string;
  examples: string[];
}

const DISTRIBUTION_FUNCTIONS: DistributionFunction[] = [
  {
    name: "T.TEST",
    handler: tTest,
    minArgs: 4,
    maxArgs: 4,
    description: "Returns the p-value of a t-test: tails 1 or 2; type 1 paired, 2 equal variance, 3 unequal variance (Welch)",
    examples: ["T.TEST(A2:A20, B2:B20, 2, 3)"],
  },
  {
    name: "T.DIST",
    handler: tDist,
    minArgs: 3,
    maxArgs: 3,
    description: "Returns the left-tailed Student's t distribution (cumulative TRUE) or its density",
    examples: ["T.DIST(1.96, 30, TRUE)"],
  },
  {
    name: "T.DIST.2T",
    handler: numericHandler(2, tDistTwoTailed),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the two-tailed Student's t distribution for x >= 0",
    examples: ["T.DIST.2T(1.96, 30)"],
  },
  {
    name: "T.DIST.RT",
    handler: numericHandler(2, tDistRightTailed),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the right-tailed Student's t distribution",
    examples: ["T.DIST.RT(1.96, 30)"],
  },
  {
    name: "T.INV",
    handler: numericHandler(2, tInv),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the t value with the given left-tailed probability",
    examples: ["T.INV(0.975, 30)"],
  },
  {
    name: "T.INV.2T",
    handler: numericHandler(2, tInvTwoTailed),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the t value whose two tails hold the given probability",
    examples: ["T.INV.2T(0.05, 30)"],
  },
  {
    name: "NORM.DIST",
    handler: normDist,
    minArgs: 4,
    maxArgs: 4,
    description: "Returns the normal distribution (cumulative TRUE) or its density",
    examples: ["NORM.DIST(42, 40, 1.5, TRUE)"],
  },
  {
    name: "NORM.S.DIST",
    handler: normStandardDist,
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the standard normal distribution (cumulative TRUE) or its density",
    examples: ["NORM.S.DIST(1.96, TRUE)"],
  },
  {
    name: "NORM.INV",
    handler: numericHandler(3, normInv),
    minArgs: 3,
    maxArgs: 3,
    description: "Returns the value with the given cumulative normal probability",
    examples: ["NORM.INV(0.9, 40, 1.5)"],
  },
  {
    name: "NORM.S.INV",
    handler: numericHandler(1, normStandardInv),
    minArgs: 1,
    maxArgs: 1,
    description: "Returns the z with the given cumulative standard normal probability",
    examples: ["NORM.S.INV(0.975)"],
  },
  {
    name: "CONFIDENCE.NORM",
    handler: numericHandler(3, confidenceNorm),
    minArgs: 3,
    maxArgs: 3,
    description: "Returns the half-width of a confidence interval for a mean, using the normal distribution",
    examples: ["CONFIDENCE.NORM(0.05, 2.5, 50)"],
  },
  {
    name: "CONFIDENCE.T",
    handler: numericHandler(3, confidenceT),
    minArgs: 3,
    maxArgs: 3,
    description: "Returns the half-width of a confidence interval for a mean, using Student's t distribution",
    examples: ["CONFIDENCE.T(0.05, 1, 50)"],
  },
];

DISTRIBUTION_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Statistical" }));
