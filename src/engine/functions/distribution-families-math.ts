/**
 * The chi-square, F, gamma, beta, lognormal, Weibull and exponential distributions, and the
 * binomial, Poisson, hypergeometric and negative binomial ones: densities, both tails and
 * inverses. Built on the incomplete gamma and beta functions in special-functions.ts; each tail is
 * computed directly rather than as 1 minus the other, so a small probability keeps its digits.
 */

import { logBeta, logGamma, regularizedBetaFromLogs, regularizedGammaLower, regularizedGammaUpper } from "./special-functions";
import { normalCdf, normalQuantile } from "./distribution-math";

const LN2 = Math.LN2;
const MAX_BISECTIONS = 1100;
const RELATIVE_WIDTH = 1e-15;
// The incomplete beta loses a few ulps, so a cumulative that is exactly alpha can read just below it.
const TIE_TOLERANCE = 1e-12;

const logChoose = (n: number, k: number): number => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);

// ---------------------------------------------------------------- inverses

/** The x in [low, high] where the increasing `cdf` reaches `p`, the bracket widened upward until
 *  it holds the answer, then bisected until it is as narrow as a double can tell. */
export function invertIncreasing(cdf: (x: number) => number, p: number, low: number, high: number): number {
  const bracket = { low, high };
  while (cdf(bracket.high) < p && bracket.high < Number.MAX_VALUE / 2) bracket.high *= 2;
  for (let step = 0; step < MAX_BISECTIONS; step += 1) {
    const middle = (bracket.low + bracket.high) / 2;
    if (middle === bracket.low || middle === bracket.high) break;
    if (cdf(middle) < p) bracket.low = middle;
    else bracket.high = middle;
    if (bracket.high - bracket.low <= RELATIVE_WIDTH * Math.abs(middle)) break;
  }
  return (bracket.low + bracket.high) / 2;
}

/** The x where the decreasing `upper` tail falls to `q`: where the increasing `-upper` reaches `-q`. */
const invertDecreasing = (upper: (x: number) => number, q: number, low: number, high: number): number => invertIncreasing((x) => -upper(x), -q, low, high);

// ---------------------------------------------------------------- chi-square

export const chiSquareCdf = (x: number, df: number): number => regularizedGammaLower(df / 2, x / 2);
export const chiSquareUpper = (x: number, df: number): number => regularizedGammaUpper(df / 2, x / 2);

export function chiSquareDensity(x: number, df: number): number {
  if (x === 0) return df === 2 ? 0.5 : df < 2 ? Infinity : 0;
  return Math.exp((df / 2 - 1) * Math.log(x) - x / 2 - (df / 2) * LN2 - logGamma(df / 2));
}

export const chiSquareQuantile = (p: number, df: number): number => (p === 0 ? 0 : invertIncreasing((x) => chiSquareCdf(x, df), p, 0, df + 1));
export const chiSquareUpperQuantile = (q: number, df: number): number => (q === 1 ? 0 : invertDecreasing((x) => chiSquareUpper(x, df), q, 0, df + 1));

// ---------------------------------------------------------------- F

/** ln of d1·x / (d1·x + d2) and of d2 / (d1·x + d2), the beta variable of the F distribution. */
function fBetaLogs(x: number, d1: number, d2: number): { logX: number; logComplement: number } {
  const logTotal = Math.log(d1 * x + d2);
  return { logX: Math.log(d1 * x) - logTotal, logComplement: Math.log(d2) - logTotal };
}

export function fCdf(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  const { logX, logComplement } = fBetaLogs(x, d1, d2);
  return regularizedBetaFromLogs(logX, logComplement, d1 / 2, d2 / 2);
}

export function fUpper(x: number, d1: number, d2: number): number {
  if (x <= 0) return 1;
  const { logX, logComplement } = fBetaLogs(x, d1, d2);
  return regularizedBetaFromLogs(logComplement, logX, d2 / 2, d1 / 2);
}

export function fDensity(x: number, d1: number, d2: number): number {
  if (x === 0) return d1 === 2 ? 1 : d1 < 2 ? Infinity : 0;
  const logTotal = Math.log(d1 * x + d2);
  return Math.exp(0.5 * (d1 * Math.log(d1 * x) + d2 * Math.log(d2) - (d1 + d2) * logTotal) - Math.log(x) - logBeta(d1 / 2, d2 / 2));
}

export const fQuantile = (p: number, d1: number, d2: number): number => (p === 0 ? 0 : invertIncreasing((x) => fCdf(x, d1, d2), p, 0, 2));
export const fUpperQuantile = (q: number, d1: number, d2: number): number => (q === 1 ? 0 : invertDecreasing((x) => fUpper(x, d1, d2), q, 0, 2));

// ---------------------------------------------------------------- gamma, exponential, Weibull

export const gammaCdf = (x: number, shape: number, scale: number): number => regularizedGammaLower(shape, x / scale);

export function gammaDensity(x: number, shape: number, scale: number): number {
  if (x === 0) return shape === 1 ? 1 / scale : shape < 1 ? Infinity : 0;
  return Math.exp((shape - 1) * Math.log(x) - x / scale - shape * Math.log(scale) - logGamma(shape));
}

export const gammaQuantile = (p: number, shape: number, scale: number): number =>
  p === 0 ? 0 : invertIncreasing((x) => gammaCdf(x, shape, scale), p, 0, scale * (shape + 1));

export const exponentialCdf = (x: number, rate: number): number => -Math.expm1(-rate * x);
export const exponentialDensity = (x: number, rate: number): number => rate * Math.exp(-rate * x);

export const weibullCdf = (x: number, shape: number, scale: number): number => -Math.expm1(-((x / scale) ** shape));

export function weibullDensity(x: number, shape: number, scale: number): number {
  if (x === 0) return shape === 1 ? 1 / scale : shape < 1 ? Infinity : 0;
  return (shape / scale) * (x / scale) ** (shape - 1) * Math.exp(-((x / scale) ** shape));
}

// ---------------------------------------------------------------- beta

export const betaCdf = (x: number, alpha: number, beta: number): number => regularizedBetaFromLogs(Math.log(x), Math.log1p(-x), alpha, beta);

export function betaDensity(x: number, alpha: number, beta: number): number {
  if (x === 0) return alpha === 1 ? Math.exp(-logBeta(alpha, beta)) : alpha < 1 ? Infinity : 0;
  if (x === 1) return beta === 1 ? Math.exp(-logBeta(alpha, beta)) : beta < 1 ? Infinity : 0;
  return Math.exp((alpha - 1) * Math.log(x) + (beta - 1) * Math.log1p(-x) - logBeta(alpha, beta));
}

export const betaQuantile = (p: number, alpha: number, beta: number): number => (p === 1 ? 1 : invertIncreasing((x) => betaCdf(x, alpha, beta), p, 0, 1));

// ---------------------------------------------------------------- lognormal

export const lognormalCdf = (x: number, mean: number, sd: number): number => normalCdf((Math.log(x) - mean) / sd);

export function lognormalDensity(x: number, mean: number, sd: number): number {
  const z = (Math.log(x) - mean) / sd;
  return Math.exp(-0.5 * z * z) / (x * sd * Math.sqrt(2 * Math.PI));
}

export const lognormalQuantile = (p: number, mean: number, sd: number): number => Math.exp(mean + sd * normalQuantile(p));

// ---------------------------------------------------------------- binomial

export function binomialPmf(successes: number, trials: number, p: number): number {
  if (p === 0) return successes === 0 ? 1 : 0;
  if (p === 1) return successes === trials ? 1 : 0;
  return Math.exp(logChoose(trials, successes) + successes * Math.log(p) + (trials - successes) * Math.log1p(-p));
}

/** P(S ≤ s) = I_{1−p}(n − s, s + 1). */
export function binomialCdf(successes: number, trials: number, p: number): number {
  if (successes >= trials || p === 0) return 1;
  if (p === 1) return 0;
  return regularizedBetaFromLogs(Math.log1p(-p), Math.log(p), trials - successes, successes + 1);
}

/** BINOM.INV: the smallest s with P(S ≤ s) ≥ alpha, found by halving 0..n. */
export function binomialQuantile(trials: number, p: number, alpha: number): number {
  const range = { low: 0, high: trials };
  const reached = alpha * (1 - TIE_TOLERANCE);
  while (range.low < range.high) {
    const middle = Math.floor((range.low + range.high) / 2);
    if (binomialCdf(middle, trials, p) >= reached) range.high = middle;
    else range.low = middle + 1;
  }
  return range.low;
}

// ---------------------------------------------------------------- Poisson

export function poissonPmf(events: number, mean: number): number {
  if (mean === 0) return events === 0 ? 1 : 0;
  return Math.exp(events * Math.log(mean) - mean - logGamma(events + 1));
}

/** P(X ≤ k) = Q(k + 1, mean). */
export const poissonCdf = (events: number, mean: number): number => (mean === 0 ? 1 : regularizedGammaUpper(events + 1, mean));

// ---------------------------------------------------------------- hypergeometric

/** The draws of a hypergeometric distribution: a sample of `sampleSize` from `population`
 *  items, `successes` of which count. */
export interface Hypergeometric {
  sampleSize: number;
  successes: number;
  population: number;
}

export function hypergeometricPmf(k: number, { sampleSize, successes, population }: Hypergeometric): number {
  if (k < Math.max(0, sampleSize - population + successes) || k > Math.min(sampleSize, successes)) return 0;
  return Math.exp(logChoose(successes, k) + logChoose(population - successes, sampleSize - k) - logChoose(population, sampleSize));
}

export function hypergeometricCdf(k: number, draws: Hypergeometric): number {
  const lowest = Math.max(0, draws.sampleSize - draws.population + draws.successes);
  const terms = Array.from({ length: Math.max(0, k - lowest + 1) }, (_, offset) => hypergeometricPmf(lowest + offset, draws));
  return Math.min(
    1,
    terms.reduce((sum, term) => sum + term, 0),
  );
}

// ---------------------------------------------------------------- negative binomial

export function negativeBinomialPmf(failures: number, successes: number, p: number): number {
  if (p === 1) return failures === 0 ? 1 : 0;
  return Math.exp(logChoose(failures + successes - 1, failures) + successes * Math.log(p) + failures * Math.log1p(-p));
}

/** P(F ≤ f) = I_p(s, f + 1). */
export const negativeBinomialCdf = (failures: number, successes: number, p: number): number =>
  p === 1 ? 1 : regularizedBetaFromLogs(Math.log(p), Math.log1p(-p), successes, failures + 1);
