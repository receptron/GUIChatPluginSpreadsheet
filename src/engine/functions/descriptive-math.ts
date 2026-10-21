/**
 * Pure rules for the remaining descriptive statistics: TRIMMEAN, AVEDEV, DEVSQ, SKEW.P,
 * PERCENTILE.EXC, QUARTILE.EXC, PERCENTRANK.EXC, RANK.AVG, PROB, and the rank correlations
 * SPEARMAN and KENDALL. Each takes numbers already read and answers a number or Excel's error.
 */

import { DIV_ZERO_ERROR, NA_ERROR, NUM_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import { correlation, mean, sumOfSquaredDeviations, type NumericPairs } from "./analysis-math";

type Result = number | SpreadsheetError;

const QUARTERS = 4;
const MIN_SKEWNESS_VALUES = 3;
// Probabilities that should sum to 1 rarely do exactly in floating point (0.1 + 0.2 + 0.7).
const PROBABILITY_SUM_TOLERANCE = 1e-9;

// A Float64Array sorts by value; a plain array's default sort compares text.
const ascending = (values: readonly number[]): number[] => Array.from(Float64Array.from(values).toSorted());

/** TRIMMEAN: the mean once ⌊n·percent / 2⌋ values are dropped from each end, as Excel rounds the
 *  dropped count down to an even number. A percent outside 0 ≤ p < 1, or no values: #NUM!. */
export function trimmedMean(values: readonly number[], percent: number): Result {
  if (values.length === 0 || percent < 0 || percent >= 1) return NUM_ERROR;
  const dropped = Math.floor((values.length * percent) / 2);
  return mean(ascending(values).slice(dropped, values.length - dropped));
}

/** AVEDEV: the mean absolute deviation from the mean. No values: #NUM!. */
export function averageDeviation(values: readonly number[]): Result {
  if (values.length === 0) return NUM_ERROR;
  const center = mean([...values]);
  return values.reduce((sum, value) => sum + Math.abs(value - center), 0) / values.length;
}

/** DEVSQ: the sum of squared deviations from the mean. No values: #NUM!. */
export const squaredDeviations = (values: readonly number[]): Result => (values.length === 0 ? NUM_ERROR : sumOfSquaredDeviations([...values]));

/** SKEW.P: the population skewness, the third central moment over the second to the 3/2. Fewer
 *  than three values, or values that never vary: #DIV/0!, as for SKEW. */
export function populationSkewness(values: readonly number[]): Result {
  if (values.length < MIN_SKEWNESS_VALUES) return DIV_ZERO_ERROR;
  const center = mean([...values]);
  const moment = (power: number): number => values.reduce((sum, value) => sum + (value - center) ** power, 0) / values.length;
  const variance = moment(2);
  return variance === 0 ? DIV_ZERO_ERROR : moment(3) / variance ** 1.5;
}

/** PERCENTILE.EXC: the value at 1-based position k·(n + 1) of the sorted values, interpolated.
 *  A position outside 1..n — k below 1/(n+1) or above n/(n+1) — is #NUM!. */
export function percentileExclusive(values: readonly number[], k: number): Result {
  const sorted = ascending(values);
  const position = k * (sorted.length + 1);
  if (sorted.length === 0 || position < 1 || position > sorted.length) return NUM_ERROR;
  const lower = sorted[Math.floor(position) - 1] ?? 0;
  const upper = sorted[Math.ceil(position) - 1] ?? lower;
  return lower + (position - Math.floor(position)) * (upper - lower);
}

/** QUARTILE.EXC: quart truncated, as PERCENTILE.EXC at quart / 4. A quart outside 1..3 lands
 *  outside the positions PERCENTILE.EXC takes, so it is #NUM! there. */
export const quartileExclusive = (values: readonly number[], quart: number): Result => percentileExclusive(values, Math.trunc(quart) / QUARTERS);

/** Where x falls in the sorted values as a 1-based position, interpolated between neighbours. */
function interpolatedPosition(sorted: readonly number[], x: number): number {
  const below = sorted.filter((value) => value < x).length;
  if (sorted[below] === x) return below + 1;
  const lower = sorted[below - 1] ?? x;
  const upper = sorted[below] ?? x;
  return below + (x - lower) / (upper - lower);
}

/** PERCENTRANK.EXC: x's position over n + 1, truncated to `significance` digits as Excel truncates.
 *  No values or fewer than one digit: #NUM!. An x outside the values: #N/A. */
export function percentRankExclusive(values: readonly number[], x: number, significance: number): Result {
  const digits = Math.trunc(significance);
  if (digits < 1 || values.length === 0) return NUM_ERROR;
  const sorted = ascending(values);
  const [smallest, largest] = [sorted[0] ?? x, sorted.at(-1) ?? x];
  if (x < smallest || x > largest) return NA_ERROR;
  const scale = 10 ** digits;
  // A rank that is exactly k / 10^digits can come out a hair below it; a few ulps keep it there.
  return Math.floor((interpolatedPosition(sorted, x) / (sorted.length + 1)) * scale * (1 + Number.EPSILON * 4)) / scale;
}

/** RANK.AVG: x's rank, largest first unless `ascendingOrder`, the mean of the ranks it ties for.
 *  An x the values do not hold: #N/A. */
export function averageRank(x: number, values: readonly number[], ascendingOrder: boolean): Result {
  const ties = values.filter((value) => value === x).length;
  if (ties === 0) return NA_ERROR;
  const ahead = values.filter((value) => (ascendingOrder ? value < x : value > x)).length;
  return ahead + (ties + 1) / 2;
}

/** Each value's rank in ascending order, ties sharing the mean of their ranks (1-based). */
export function averageRanks(values: readonly number[]): number[] {
  return values.map((value) => Number(averageRank(value, values, true)));
}

/** PROB: the probability that a value lies between `lower` and `upper` (or equals `lower` when
 *  there is no upper), bounds given in either order as LibreOffice reads them. A probability
 *  outside 0 < p ≤ 1, or probabilities that do not sum to 1: #NUM!. */
export function probability({ ys: values, xs: probabilities }: NumericPairs, lower: number, upper: number): Result {
  if (probabilities.some((p) => p <= 0 || p > 1)) return NUM_ERROR;
  const total = probabilities.reduce((sum, p) => sum + p, 0);
  if (Math.abs(total - 1) > PROBABILITY_SUM_TOLERANCE) return NUM_ERROR;
  const [low, high] = lower <= upper ? [lower, upper] : [upper, lower];
  return values.reduce((sum, value, index) => (value >= low && value <= high ? sum + (probabilities[index] ?? 0) : sum), 0);
}

/** SPEARMAN: the Pearson correlation of the two sides' average ranks. */
export const spearman = ({ ys, xs }: NumericPairs): Result => correlation({ ys: averageRanks(ys), xs: averageRanks(xs) });

const sign = (value: number): number => Math.sign(value);

/** KENDALL: Kendall's τ-b, ties in either side taken out of the denominator, as scipy's default.
 *  Fewer than two pairs, or a side that never varies: #DIV/0!. */
export function kendall({ ys, xs }: NumericPairs): Result {
  const totals = { concordance: 0, untiedY: 0, untiedX: 0 };
  ys.forEach((y, i) =>
    ys.slice(i + 1).forEach((laterY, offset) => {
      const [dy, dx] = [sign(laterY - y), sign((xs[i + 1 + offset] ?? 0) - (xs[i] ?? 0))];
      totals.concordance += dy * dx;
      totals.untiedY += dy === 0 ? 0 : 1;
      totals.untiedX += dx === 0 ? 0 : 1;
    }),
  );
  const denominator = Math.sqrt(totals.untiedY * totals.untiedX);
  return denominator === 0 ? DIV_ZERO_ERROR : totals.concordance / denominator;
}
