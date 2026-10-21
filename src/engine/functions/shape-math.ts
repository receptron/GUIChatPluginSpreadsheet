/**
 * The shape of one sample — skewness, kurtosis, percent rank — and its geometric and harmonic
 * means, as pure numerics with Excel's formulas and Excel's errors. Registered in shape.ts.
 */

import { DIV_ZERO_ERROR, NA_ERROR, NUM_ERROR, type SpreadsheetError } from "../spreadsheet-errors";

type Result = number | SpreadsheetError;

const MIN_FOR_SKEW = 3;
const MIN_FOR_KURT = 4;

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Σ ((x − mean) / s)^power with s the sample standard deviation, or null when s is 0. */
function standardizedPowerSum(values: number[], power: number): number | null {
  const center = mean(values);
  const deviations = values.map((value) => value - center);
  const sd = Math.sqrt(deviations.reduce((sum, deviation) => sum + deviation * deviation, 0) / (values.length - 1));
  return sd === 0 ? null : deviations.reduce((sum, deviation) => sum + (deviation / sd) ** power, 0);
}

/** SKEW: n / ((n − 1)(n − 2)) · Σ z³. Fewer than three values, or none that differ: #DIV/0!. */
export function skewness(values: number[]): Result {
  const n = values.length;
  const sum = n < MIN_FOR_SKEW ? null : standardizedPowerSum(values, 3);
  return sum === null ? DIV_ZERO_ERROR : (n / ((n - 1) * (n - 2))) * sum;
}

/** KURT: n(n + 1) / ((n − 1)(n − 2)(n − 3)) · Σ z⁴ − 3(n − 1)² / ((n − 2)(n − 3)). Fewer than four
 *  values, or none that differ: #DIV/0!. */
export function kurtosis(values: number[]): Result {
  const n = values.length;
  const sum = n < MIN_FOR_KURT ? null : standardizedPowerSum(values, 4);
  if (sum === null) return DIV_ZERO_ERROR;
  return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
}

/** STANDARDIZE: (x − mean) / sd, for sd > 0. */
export const standardize = (x: number, center: number, sd: number): Result => (sd > 0 ? (x - center) / sd : NUM_ERROR);

/** GEOMEAN: the n-th root of the product, through logs. Any value at or below 0, or none: #NUM!. */
export function geometricMean(values: number[]): Result {
  if (values.length === 0 || values.some((value) => value <= 0)) return NUM_ERROR;
  return Math.exp(mean(values.map(Math.log)));
}

/** HARMEAN: n / Σ (1 / x). Any value at or below 0, or none: #NUM!. */
export function harmonicMean(values: number[]): Result {
  if (values.length === 0 || values.some((value) => value <= 0)) return NUM_ERROR;
  return values.length / values.reduce((sum, value) => sum + 1 / value, 0);
}

/** Where `x` falls among the sorted values, as a fraction 0..1: the share of the other values
 *  below it, interpolated between the two values around an x that is not in the data. */
function percentRankUntruncated(sorted: number[], x: number): number {
  const last = sorted.length - 1;
  const below = sorted.filter((value) => value < x).length;
  if (sorted[below] === x) return below / last;
  const lower = sorted[below - 1] ?? x;
  const upper = sorted[below] ?? x;
  return (below - 1 + (x - lower) / (upper - lower)) / last;
}

/** PERCENTRANK.INC with `significance` digits, truncated as Excel truncates. No data, or fewer
 *  than one significant digit: #NUM!. An x outside the data: #N/A. One value: 1 when it is x. */
export function percentRank(values: number[], x: number, significance: number): Result {
  const digits = Math.trunc(significance);
  if (digits < 1 || values.length === 0) return NUM_ERROR;
  // A Float64Array sorts by value; a plain array's default sort compares text.
  const sorted = Array.from(Float64Array.from(values).toSorted());
  const [smallest, largest] = [sorted[0], sorted.at(-1)];
  if (smallest === undefined || largest === undefined || x < smallest || x > largest) return NA_ERROR;
  if (sorted.length === 1) return 1;
  const scale = 10 ** digits;
  // A rank that is exactly k / 10^digits can come out a hair below it; floored as is, it would
  // drop to the digit beneath. A few ulps of headroom keep it.
  return Math.floor(percentRankUntruncated(sorted, x) * scale * (1 + Number.EPSILON * 4)) / scale;
}
