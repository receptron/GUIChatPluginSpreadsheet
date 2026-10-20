/**
 * The chi-square, F, binomial, Poisson, hypergeometric, negative binomial, exponential, gamma,
 * beta, lognormal and Weibull distributions, and PHI, GAUSS, FISHER and FISHERINV. The numerics
 * live in distribution-families-math.ts; this file applies Excel's argument rules — counts and
 * degrees of freedom truncated to integers, anything out of range #NUM! — and registers the names.
 */

import { functionRegistry, type FunctionContext, type FunctionHandler } from "../registry";
import { NUM_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import { booleanArg, degreesOfFreedom, numberArg, numberArgs, numericHandler } from "./distribution-args";
import { normalCdf, normalDensity } from "./distribution-math";
import { logGamma } from "./special-functions";
import {
  betaCdf,
  betaDensity,
  betaQuantile,
  binomialCdf,
  binomialPmf,
  binomialQuantile,
  chiSquareCdf,
  chiSquareDensity,
  chiSquareQuantile,
  chiSquareUpper,
  chiSquareUpperQuantile,
  exponentialCdf,
  exponentialDensity,
  fCdf,
  fDensity,
  fQuantile,
  fUpper,
  fUpperQuantile,
  gammaCdf,
  gammaDensity,
  gammaQuantile,
  hypergeometricCdf,
  hypergeometricPmf,
  lognormalCdf,
  lognormalDensity,
  lognormalQuantile,
  negativeBinomialCdf,
  negativeBinomialPmf,
  poissonCdf,
  poissonPmf,
  weibullCdf,
  weibullDensity,
} from "./distribution-families-math";

type Result = number | SpreadsheetError;

// Excel takes degrees of freedom up to 10^10.
const MAX_DEGREES_OF_FREEDOM = 1e10;

/** Degrees of freedom within Excel's range, truncated; null for one outside it. */
const boundedDegrees = (value: number): number | null => {
  const df = degreesOfFreedom(value);
  return df !== null && df <= MAX_DEGREES_OF_FREEDOM ? df : null;
};

const isProbability = (p: number): boolean => p >= 0 && p <= 1;

/** A handler over `count` numbers followed by a cumulative flag: `rule(numbers, cumulative)`. */
const withCumulative =
  (count: number, rule: (values: number[], cumulative: boolean) => Result): FunctionHandler =>
  (args, context) => {
    const values = numberArgs(args, context, count);
    if (!Array.isArray(values)) return values;
    const cumulative = booleanArg(args, context, count);
    return typeof cumulative === "boolean" ? rule(values, cumulative) : cumulative;
  };

/** The optional bounds of BETA.DIST and BETA.INV at `index` and after, 0 and 1 when left out. */
function betaBounds(args: string[], context: FunctionContext, index: number): [number, number] | SpreadsheetError {
  const lower = args.length > index ? numberArg(args, context, index) : 0;
  if (typeof lower !== "number") return lower;
  const upper = args.length > index + 1 ? numberArg(args, context, index + 1) : 1;
  return typeof upper === "number" ? [lower, upper] : upper;
}

// ---------------------------------------------------------------- chi-square

const chiSquareDist = ([x = 0, rawDf = 0]: number[], cumulative: boolean): Result => {
  const df = boundedDegrees(rawDf);
  if (df === null || x < 0) return NUM_ERROR;
  return cumulative ? chiSquareCdf(x, df) : chiSquareDensity(x, df);
};

const chiSquareDistRight = ([x = 0, rawDf = 0]: number[]): Result => {
  const df = boundedDegrees(rawDf);
  return df === null || x < 0 ? NUM_ERROR : chiSquareUpper(x, df);
};

/** An inverse is #NUM! at the end of 0..1 whose quantile is infinite: 1 for a left tail, 0 for a right. */
const LEFT_TAIL_INFINITE_AT = 1;
const RIGHT_TAIL_INFINITE_AT = 0;

const chiSquareInv =
  (quantile: (p: number, df: number) => number, infiniteAt: number) =>
  ([p = 0, rawDf = 0]: number[]): Result => {
    const df = boundedDegrees(rawDf);
    return df === null || !isProbability(p) || p === infiniteAt ? NUM_ERROR : quantile(p, df);
  };

// ---------------------------------------------------------------- F

const fDegrees = (raw1: number, raw2: number): [number, number] | null => {
  const [d1, d2] = [boundedDegrees(raw1), boundedDegrees(raw2)];
  return d1 === null || d2 === null ? null : [d1, d2];
};

const fDist = ([x = 0, raw1 = 0, raw2 = 0]: number[], cumulative: boolean): Result => {
  const degrees = fDegrees(raw1, raw2);
  if (degrees === null || x < 0) return NUM_ERROR;
  return cumulative ? fCdf(x, ...degrees) : fDensity(x, ...degrees);
};

const fDistRight = ([x = 0, raw1 = 0, raw2 = 0]: number[]): Result => {
  const degrees = fDegrees(raw1, raw2);
  return degrees === null || x < 0 ? NUM_ERROR : fUpper(x, ...degrees);
};

const fInv =
  (quantile: (p: number, d1: number, d2: number) => number, infiniteAt: number) =>
  ([p = 0, raw1 = 0, raw2 = 0]: number[]): Result => {
    const degrees = fDegrees(raw1, raw2);
    return degrees === null || !isProbability(p) || p === infiniteAt ? NUM_ERROR : quantile(p, ...degrees);
  };

// ---------------------------------------------------------------- discrete

const binomDist = ([rawSuccesses = 0, rawTrials = 0, p = 0]: number[], cumulative: boolean): Result => {
  const [successes, trials] = [Math.trunc(rawSuccesses), Math.trunc(rawTrials)];
  if (successes < 0 || successes > trials || !isProbability(p)) return NUM_ERROR;
  return cumulative ? binomialCdf(successes, trials, p) : binomialPmf(successes, trials, p);
};

const binomInv = ([rawTrials = 0, p = 0, alpha = 0]: number[]): Result => {
  const trials = Math.trunc(rawTrials);
  return trials < 0 || !isProbability(p) || !isProbability(alpha) ? NUM_ERROR : binomialQuantile(trials, p, alpha);
};

const poissonDist = ([rawEvents = 0, mean = 0]: number[], cumulative: boolean): Result => {
  const events = Math.trunc(rawEvents);
  if (events < 0 || mean < 0) return NUM_ERROR;
  return cumulative ? poissonCdf(events, mean) : poissonPmf(events, mean);
};

const hypergeomDist = ([rawK = 0, rawSample = 0, rawSuccesses = 0, rawPopulation = 0]: number[], cumulative: boolean): Result => {
  const [k, sampleSize, successes, population] = [Math.trunc(rawK), Math.trunc(rawSample), Math.trunc(rawSuccesses), Math.trunc(rawPopulation)];
  const draws = { sampleSize, successes, population };
  if (population <= 0 || sampleSize <= 0 || sampleSize > population || successes <= 0 || successes > population) return NUM_ERROR;
  if (k < Math.max(0, sampleSize - population + successes) || k > Math.min(sampleSize, successes)) return NUM_ERROR;
  return cumulative ? hypergeometricCdf(k, draws) : hypergeometricPmf(k, draws);
};

const negbinomDist = ([rawFailures = 0, rawSuccesses = 0, p = 0]: number[], cumulative: boolean): Result => {
  const [failures, successes] = [Math.trunc(rawFailures), Math.trunc(rawSuccesses)];
  if (failures < 0 || successes < 1 || !isProbability(p)) return NUM_ERROR;
  return cumulative ? negativeBinomialCdf(failures, successes, p) : negativeBinomialPmf(failures, successes, p);
};

// ---------------------------------------------------------------- continuous

const exponDist = ([x = 0, rate = 0]: number[], cumulative: boolean): Result => {
  if (x < 0 || rate <= 0) return NUM_ERROR;
  return cumulative ? exponentialCdf(x, rate) : exponentialDensity(x, rate);
};

const gammaDist = ([x = 0, shape = 0, scale = 0]: number[], cumulative: boolean): Result => {
  if (x < 0 || shape <= 0 || scale <= 0) return NUM_ERROR;
  return cumulative ? gammaCdf(x, shape, scale) : gammaDensity(x, shape, scale);
};

const gammaInv = ([p = 0, shape = 0, scale = 0]: number[]): Result =>
  p < 0 || p >= 1 || shape <= 0 || scale <= 0 ? NUM_ERROR : gammaQuantile(p, shape, scale);

const gammaLn = ([x = 0]: number[]): Result => (x <= 0 ? NUM_ERROR : logGamma(x));

const weibullDist = ([x = 0, shape = 0, scale = 0]: number[], cumulative: boolean): Result => {
  if (x < 0 || shape <= 0 || scale <= 0) return NUM_ERROR;
  return cumulative ? weibullCdf(x, shape, scale) : weibullDensity(x, shape, scale);
};

const lognormDist = ([x = 0, mean = 0, sd = 0]: number[], cumulative: boolean): Result => {
  if (x <= 0 || sd <= 0) return NUM_ERROR;
  return cumulative ? lognormalCdf(x, mean, sd) : lognormalDensity(x, mean, sd);
};

const lognormInv = ([p = 0, mean = 0, sd = 0]: number[]): Result => (p <= 0 || p >= 1 || sd <= 0 ? NUM_ERROR : lognormalQuantile(p, mean, sd));

/** BETA.DIST(x, α, β, cumulative, [A], [B]): x rescaled from [A, B] to [0, 1]. */
const betaDistHandler: FunctionHandler = (args, context) => {
  const values = numberArgs(args, context, 3);
  if (!Array.isArray(values)) return values;
  const cumulative = booleanArg(args, context, 3);
  if (typeof cumulative !== "boolean") return cumulative;
  const bounds = betaBounds(args, context, 4);
  if (!Array.isArray(bounds)) return bounds;
  const [[x = 0, alpha = 0, beta = 0], [lower, upper]] = [values, bounds];
  if (alpha <= 0 || beta <= 0 || x < lower || x > upper || lower === upper) return NUM_ERROR;
  const unit = (x - lower) / (upper - lower);
  return cumulative ? betaCdf(unit, alpha, beta) : betaDensity(unit, alpha, beta) / (upper - lower);
};

/** BETA.INV(p, α, β, [A], [B]). */
const betaInvHandler: FunctionHandler = (args, context) => {
  const values = numberArgs(args, context, 3);
  if (!Array.isArray(values)) return values;
  const bounds = betaBounds(args, context, 3);
  if (!Array.isArray(bounds)) return bounds;
  const [[p = 0, alpha = 0, beta = 0], [lower, upper]] = [values, bounds];
  if (alpha <= 0 || beta <= 0 || p <= 0 || p > 1 || lower >= upper) return NUM_ERROR;
  return lower + (upper - lower) * betaQuantile(p, alpha, beta);
};

const fisher = ([x = 0]: number[]): Result => (x <= -1 || x >= 1 ? NUM_ERROR : Math.atanh(x));

interface FamilyFunction {
  name: string;
  handler: FunctionHandler;
  minArgs: number;
  maxArgs: number;
  description: string;
  examples: string[];
}

const fixed = (name: string, count: number, handler: FunctionHandler, description: string, example: string): FamilyFunction => ({
  name,
  handler,
  minArgs: count,
  maxArgs: count,
  description,
  examples: [example],
});

const FAMILY_FUNCTIONS: FamilyFunction[] = [
  fixed("CHISQ.DIST", 3, withCumulative(2, chiSquareDist), "Returns the chi-square distribution (cumulative or density)", "CHISQ.DIST(0.5, 1, TRUE)"),
  fixed("CHISQ.DIST.RT", 2, numericHandler(2, chiSquareDistRight), "Returns the right tail of the chi-square distribution", "CHISQ.DIST.RT(18.307, 10)"),
  fixed(
    "CHISQ.INV",
    2,
    numericHandler(2, chiSquareInv(chiSquareQuantile, LEFT_TAIL_INFINITE_AT)),
    "Returns the inverse of the left tail of the chi-square distribution",
    "CHISQ.INV(0.93, 1)",
  ),
  fixed(
    "CHISQ.INV.RT",
    2,
    numericHandler(2, chiSquareInv(chiSquareUpperQuantile, RIGHT_TAIL_INFINITE_AT)),
    "Returns the inverse of the right tail of the chi-square distribution",
    "CHISQ.INV.RT(0.050001, 10)",
  ),
  fixed("F.DIST", 4, withCumulative(3, fDist), "Returns the F distribution (cumulative or density)", "F.DIST(15.2069, 6, 4, TRUE)"),
  fixed("F.DIST.RT", 3, numericHandler(3, fDistRight), "Returns the right tail of the F distribution", "F.DIST.RT(15.2069, 6, 4)"),
  fixed(
    "F.INV",
    3,
    numericHandler(3, fInv(fQuantile, LEFT_TAIL_INFINITE_AT)),
    "Returns the inverse of the left tail of the F distribution",
    "F.INV(0.01, 6, 4)",
  ),
  fixed(
    "F.INV.RT",
    3,
    numericHandler(3, fInv(fUpperQuantile, RIGHT_TAIL_INFINITE_AT)),
    "Returns the inverse of the right tail of the F distribution",
    "F.INV.RT(0.01, 6, 4)",
  ),
  fixed("BINOM.DIST", 4, withCumulative(3, binomDist), "Returns the binomial distribution (cumulative or mass)", "BINOM.DIST(6, 10, 0.5, FALSE)"),
  fixed(
    "BINOM.INV",
    3,
    numericHandler(3, binomInv),
    "Returns the smallest count whose binomial cumulative probability reaches alpha",
    "BINOM.INV(6, 0.5, 0.75)",
  ),
  fixed("POISSON.DIST", 3, withCumulative(2, poissonDist), "Returns the Poisson distribution (cumulative or mass)", "POISSON.DIST(2, 5, TRUE)"),
  fixed("HYPGEOM.DIST", 5, withCumulative(4, hypergeomDist), "Returns the hypergeometric distribution (cumulative or mass)", "HYPGEOM.DIST(1, 4, 8, 20, TRUE)"),
  fixed(
    "NEGBINOM.DIST",
    4,
    withCumulative(3, negbinomDist),
    "Returns the negative binomial distribution (cumulative or mass)",
    "NEGBINOM.DIST(10, 5, 0.25, TRUE)",
  ),
  fixed("EXPON.DIST", 3, withCumulative(2, exponDist), "Returns the exponential distribution (cumulative or density)", "EXPON.DIST(0.2, 10, TRUE)"),
  fixed("GAMMA.DIST", 4, withCumulative(3, gammaDist), "Returns the gamma distribution (cumulative or density)", "GAMMA.DIST(10.00001131, 9, 2, TRUE)"),
  fixed("GAMMA.INV", 3, numericHandler(3, gammaInv), "Returns the inverse of the gamma cumulative distribution", "GAMMA.INV(0.068094, 9, 2)"),
  fixed("GAMMALN", 1, numericHandler(1, gammaLn), "Returns the natural logarithm of the gamma function", "GAMMALN(4)"),
  {
    ...fixed("BETA.DIST", 4, betaDistHandler, "Returns the beta distribution (cumulative or density), optionally on [A, B]", "BETA.DIST(2, 8, 10, TRUE, 1, 3)"),
    maxArgs: 6,
  },
  {
    ...fixed(
      "BETA.INV",
      3,
      betaInvHandler,
      "Returns the inverse of the beta cumulative distribution, optionally on [A, B]",
      "BETA.INV(0.685470581, 8, 10, 1, 3)",
    ),
    maxArgs: 5,
  },
  fixed("LOGNORM.DIST", 4, withCumulative(3, lognormDist), "Returns the lognormal distribution (cumulative or density)", "LOGNORM.DIST(4, 3.5, 1.2, TRUE)"),
  fixed("LOGNORM.INV", 3, numericHandler(3, lognormInv), "Returns the inverse of the lognormal cumulative distribution", "LOGNORM.INV(0.039084, 3.5, 1.2)"),
  fixed("WEIBULL.DIST", 4, withCumulative(3, weibullDist), "Returns the Weibull distribution (cumulative or density)", "WEIBULL.DIST(105, 20, 100, TRUE)"),
  fixed(
    "PHI",
    1,
    numericHandler(1, ([x = 0]) => normalDensity(x)),
    "Returns the standard normal density",
    "PHI(0.75)",
  ),
  fixed(
    "GAUSS",
    1,
    numericHandler(1, ([z = 0]) => normalCdf(z) - 0.5),
    "Returns the probability that a standard normal value lies between 0 and z",
    "GAUSS(2)",
  ),
  fixed("FISHER", 1, numericHandler(1, fisher), "Returns the Fisher transformation", "FISHER(0.75)"),
  fixed(
    "FISHERINV",
    1,
    numericHandler(1, ([y = 0]) => Math.tanh(y)),
    "Returns the inverse of the Fisher transformation",
    "FISHERINV(0.972955)",
  ),
];

FAMILY_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Statistical" }));
