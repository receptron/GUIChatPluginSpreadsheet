/**
 * The t and normal distributions and the t-test, as pure numerics. Tails are computed
 * directly rather than as 1 − (the rest), so a small p-value keeps its relative precision.
 * The spreadsheet rules (argument checks, #NUM!) live in distributions.ts.
 */

import { logBeta, regularizedBetaFromLogs, regularizedGammaUpper } from "./special-functions";

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** −x without producing −0, which a cell would show as "-0" at the median. */
const negate = (x: number): number => (x === 0 ? 0 : -x);
const RELATIVE_STEP = 1e-15;
const MAX_ITERATIONS = 200;

// ---------------------------------------------------------------- normal

export const normalDensity = (z: number): number => Math.exp(-0.5 * z * z) / SQRT_2PI;

/** P(Z > z) for the standard normal. erfc(x) is Q(1/2, x²), so the upper tail is half of it. */
export function normalUpperTail(z: number): number {
  const half = 0.5 * regularizedGammaUpper(0.5, 0.5 * z * z);
  return z >= 0 ? half : 1 - half;
}

/** P(Z ≤ z) for the standard normal. */
export const normalCdf = (z: number): number => normalUpperTail(-z);

// Acklam's rational approximation of the normal quantile, refined below by Halley steps.
const ACKLAM_A = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
const ACKLAM_B = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
const ACKLAM_C = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const ACKLAM_D = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
const ACKLAM_LOW = 0.02425;

const polynomial = (coefficients: number[], x: number): number => coefficients.reduce((sum, coefficient) => sum * x + coefficient, 0);

/** Acklam's starting point for the z with P(Z ≤ z) = p, for 0 < p ≤ 1/2. */
function acklamLowerQuantile(p: number): number {
  if (p < ACKLAM_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    return polynomial(ACKLAM_C, q) / (polynomial(ACKLAM_D, q) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (polynomial(ACKLAM_A, r) * q) / (polynomial(ACKLAM_B, r) * r + 1);
}

/** The z with P(Z ≤ z) = p, for 0 < p < 1. */
export function normalQuantile(p: number): number {
  // 1 − p is exact for p ≥ 1/2, so the upper half is the mirror of the lower one.
  if (p > 0.5) return negate(normalQuantile(1 - p));
  const state = { z: acklamLowerQuantile(p) };
  for (let step = 0; step < 3; step += 1) {
    const error = normalCdf(state.z) - p;
    const u = error / normalDensity(state.z);
    state.z -= u / (1 + (state.z * u) / 2);
  }
  return state.z;
}

/** The z with P(Z > z) = q, for 0 < q < 1. */
export const normalUpperQuantile = (q: number): number => negate(normalQuantile(q));

// ---------------------------------------------------------------- Student's t

/** The t density with `df` degrees of freedom: 1 / (√ν B(ν/2, 1/2)) · (1 + t²/ν)^(−(ν+1)/2). */
export function studentDensity(t: number, df: number): number {
  return Math.exp(-logBeta(df / 2, 0.5) - 0.5 * Math.log(df) - ((df + 1) / 2) * Math.log1p((t * t) / df));
}

/** ln x and ln(1 − x) for x = r / (1 + r), from ln r alone, so neither overflows nor rounds to 0. */
function logsOfRatioShare(logRatio: number): { logX: number; logComplement: number } {
  if (logRatio > 0) {
    const tail = Math.log1p(Math.exp(-logRatio));
    return { logX: -tail, logComplement: -logRatio - tail };
  }
  const tail = Math.log1p(Math.exp(logRatio));
  return { logX: logRatio - tail, logComplement: -tail };
}

/** P(T > t). For t ≥ 0 it is ½ · I_x(ν/2, ½) with x = ν / (ν + t²) = r / (1 + r), r = ν / t².
 *  It goes through ln r, so t² never overflows and 1 − x keeps its digits for a small t. */
export function studentUpperTail(t: number, df: number): number {
  if (t === 0) return 0.5;
  const { logX, logComplement } = logsOfRatioShare(Math.log(df) - 2 * Math.log(Math.abs(t)));
  const half = 0.5 * regularizedBetaFromLogs(logX, logComplement, df / 2, 0.5);
  return t >= 0 ? half : 1 - half;
}

/** P(T ≤ t). */
export const studentCdf = (t: number, df: number): number => studentUpperTail(-t, df);

/** A t ≥ 0 whose upper tail is at most q, found by doubling from 1. */
function upperBracket(q: number, df: number): number {
  const state = { high: 1 };
  while (studentUpperTail(state.high, df) > q && state.high < Number.MAX_VALUE / 2) state.high *= 2;
  return state.high;
}

/** One safeguarded Newton step on ln P(T > t) = ln q, kept inside [low, high]. */
function newtonStep(t: number, q: number, df: number, bracket: { low: number; high: number }): number {
  const tail = studentUpperTail(t, df);
  if (tail > q) bracket.low = t;
  else bracket.high = t;
  const next = t + ((Math.log(tail) - Math.log(q)) * tail) / studentDensity(t, df);
  return next > bracket.low && next < bracket.high && Number.isFinite(next) ? next : (bracket.low + bracket.high) / 2;
}

/** The t ≥ 0 with P(T > t) = q, for 0 < q ≤ 1/2. */
function studentUpperQuantileHalf(q: number, df: number): number {
  if (q === 0.5) return 0;
  const bracket = { low: 0, high: upperBracket(q, df) };
  const state = { t: Math.min(Math.max(normalUpperQuantile(q), 0), bracket.high) };
  for (let step = 0; step < MAX_ITERATIONS; step += 1) {
    const next = newtonStep(state.t, q, df, bracket);
    const converged = Math.abs(next - state.t) <= RELATIVE_STEP * Math.abs(next);
    state.t = next;
    if (converged) break;
  }
  return state.t;
}

/** The t with P(T > t) = q, for 0 < q < 1. */
export function studentUpperQuantile(q: number, df: number): number {
  return q > 0.5 ? negate(studentUpperQuantileHalf(1 - q, df)) : studentUpperQuantileHalf(q, df);
}

/** The t with P(T ≤ t) = p, for 0 < p < 1. */
export const studentQuantile = (p: number, df: number): number => negate(studentUpperQuantile(p, df));

// ---------------------------------------------------------------- t-test

export interface SampleSummary {
  count: number;
  mean: number;
  /** The sample variance, divided by n − 1. */
  variance: number;
}

export function summarize(values: number[]): SampleSummary {
  const count = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1);
  return { count, mean, variance };
}

export interface TStatistic {
  t: number;
  df: number;
}

/** Paired: the one-sample t of the differences. */
export function pairedT(differences: number[]): TStatistic {
  const { count, mean, variance } = summarize(differences);
  return { t: mean / Math.sqrt(variance / count), df: count - 1 };
}

/** Two samples with a pooled (equal) variance. */
export function pooledT(first: SampleSummary, second: SampleSummary): TStatistic {
  const df = first.count + second.count - 2;
  const pooled = ((first.count - 1) * first.variance + (second.count - 1) * second.variance) / df;
  return { t: (first.mean - second.mean) / Math.sqrt(pooled * (1 / first.count + 1 / second.count)), df };
}

/** Two samples with unequal variances (Welch). The Welch–Satterthwaite df is not rounded. */
export function welchT(first: SampleSummary, second: SampleSummary): TStatistic {
  const firstShare = first.variance / first.count;
  const secondShare = second.variance / second.count;
  const df = (firstShare + secondShare) ** 2 / (firstShare ** 2 / (first.count - 1) + secondShare ** 2 / (second.count - 1));
  return { t: (first.mean - second.mean) / Math.sqrt(firstShare + secondShare), df };
}

/** The p-value of a t statistic: one tail, or both. */
export const tTestProbability = ({ t, df }: TStatistic, tails: 1 | 2): number => tails * studentUpperTail(Math.abs(t), df);
