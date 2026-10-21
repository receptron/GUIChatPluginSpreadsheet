/**
 * Pure rules for the analysis functions (correlation, regression, percentiles,
 * ranks, population spread), separated from the range-reading handlers so they
 * can be unit-tested directly.
 */

import { DIV_ZERO_ERROR, NA_ERROR, NUM_ERROR, VALUE_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import { holdsNumber } from "../numericCoercion";
import { toNumber } from "../registry";
import type { CellValue } from "../types";

/** The numeric pairs two ranges share by position: `ys[i]` and `xs[i]` came from the same row. */
export interface NumericPairs {
  ys: number[];
  xs: number[];
}

const MIN_PAIRS = 2;
const PERCENT_MAX = 1;
const QUARTILES_IN_WHOLE = 4;

export const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

export const sumOfSquaredDeviations = (values: number[]): number => {
  const center = mean(values);
  return values.reduce((sum, value) => sum + (value - center) ** 2, 0);
};

/**
 * Pair two ranges by position, keeping only the pairs where both cells hold a
 * number. Excel skips a pair with a blank or text on either side, rather than
 * reading it as 0, which would pull the line towards the origin. Ranges of
 * different sizes have no pairing, so Excel answers `#N/A`.
 */
export function numericPairs(yValues: CellValue[], xValues: CellValue[]): NumericPairs | SpreadsheetError {
  if (yValues.length !== xValues.length) return NA_ERROR;
  const kept = yValues.flatMap((y, index): { y: number; x: number }[] => {
    const x = xValues[index];
    return holdsNumber(y) && x !== undefined && holdsNumber(x) ? [{ y: toNumber(y), x: toNumber(x) }] : [];
  });
  return { ys: kept.map((pair) => pair.y), xs: kept.map((pair) => pair.x) };
}

export const sumOfCrossDeviations = ({ ys, xs }: NumericPairs): number => {
  const yCenter = mean(ys);
  const xCenter = mean(xs);
  return ys.reduce((sum, y, index) => sum + (y - yCenter) * ((xs[index] ?? xCenter) - xCenter), 0);
};

/** Pearson correlation (CORREL). Fewer than two pairs, or a side that never
 *  varies, leaves a zero denominator: `#DIV/0!`. */
export function correlation(pairs: NumericPairs): number | SpreadsheetError {
  if (pairs.ys.length < MIN_PAIRS) return DIV_ZERO_ERROR;
  const denominator = Math.sqrt(sumOfSquaredDeviations(pairs.ys) * sumOfSquaredDeviations(pairs.xs));
  return denominator === 0 ? DIV_ZERO_ERROR : sumOfCrossDeviations(pairs) / denominator;
}

/** Least-squares slope of y on x (SLOPE). An x that never varies has no slope: `#DIV/0!`. */
export function slope(pairs: NumericPairs): number | SpreadsheetError {
  if (pairs.ys.length < MIN_PAIRS) return DIV_ZERO_ERROR;
  const xSpread = sumOfSquaredDeviations(pairs.xs);
  return xSpread === 0 ? DIV_ZERO_ERROR : sumOfCrossDeviations(pairs) / xSpread;
}

/** Where the least-squares line crosses x = 0 (INTERCEPT). */
export function intercept(pairs: NumericPairs): number | SpreadsheetError {
  const fitted = slope(pairs);
  return typeof fitted === "number" ? mean(pairs.ys) - fitted * mean(pairs.xs) : fitted;
}

/** The square of the correlation (RSQ). */
export function rSquared(pairs: NumericPairs): number | SpreadsheetError {
  const r = correlation(pairs);
  return typeof r === "number" ? r * r : r;
}

/**
 * The k-th percentile, interpolated the way PERCENTILE and PERCENTILE.INC do:
 * the value at position `k*(n-1)` of the sorted list, linear between its two
 * neighbours. A k outside 0..1, or nothing to rank, is `#NUM!`.
 */
export function percentileInclusive(values: number[], k: number): number | SpreadsheetError {
  if (values.length === 0 || k < 0 || k > PERCENT_MAX) return NUM_ERROR;
  const sorted = values.toSorted((a, b) => a - b);
  const position = k * (sorted.length - 1);
  const lower = sorted[Math.floor(position)] ?? 0;
  const upper = sorted[Math.ceil(position)] ?? lower;
  return lower + (position - Math.floor(position)) * (upper - lower);
}

/** QUARTILE: the quarter is truncated to 0..4 (0 is the minimum, 4 the maximum). */
export function quartileInclusive(values: number[], quarter: number): number | SpreadsheetError {
  const whole = Math.trunc(quarter);
  if (whole < 0 || whole > QUARTILES_IN_WHOLE) return NUM_ERROR;
  return percentileInclusive(values, whole / QUARTILES_IN_WHOLE);
}

/** The k-th largest value (LARGE). A fractional k is rounded up, as Excel does;
 *  a k outside 1..n is `#NUM!`. */
export function kthLargest(values: number[], k: number): number | SpreadsheetError {
  const position = Math.ceil(k);
  if (position < 1 || position > values.length) return NUM_ERROR;
  return values.toSorted((a, b) => b - a)[position - 1] ?? NUM_ERROR;
}

/** The k-th smallest value (SMALL), under the same rules as `kthLargest`. */
export function kthSmallest(values: number[], k: number): number | SpreadsheetError {
  const position = Math.ceil(k);
  if (position < 1 || position > values.length) return NUM_ERROR;
  return values.toSorted((a, b) => a - b)[position - 1] ?? NUM_ERROR;
}

/** RANK: 1 + how many values beat `target`, so equal values share the top rank.
 *  A target the list does not contain is `#N/A`. */
export function rankOf(target: number, values: number[], ascending: boolean): number | SpreadsheetError {
  if (!values.includes(target)) return NA_ERROR;
  const beats = (value: number): boolean => (ascending ? value < target : value > target);
  return values.filter(beats).length + 1;
}

/** Population variance (VARP): divided by n, not n-1. Nothing to measure is `#DIV/0!`. */
export function populationVariance(values: number[]): number | SpreadsheetError {
  if (values.length === 0) return DIV_ZERO_ERROR;
  return sumOfSquaredDeviations(values) / values.length;
}

/** Population standard deviation (STDEVP). */
export function populationStdev(values: number[]): number | SpreadsheetError {
  const variance = populationVariance(values);
  return typeof variance === "number" ? Math.sqrt(variance) : variance;
}

/** One condition of SUMIFS / COUNTIFS / AVERAGEIFS: a range read raw, and its matcher. */
export interface RangeCondition {
  range: CellValue[];
  matches: (value: CellValue) => boolean;
}

/**
 * Which rows meet every condition. Every range must be the size of the first
 * (`size`): a different size has no row-by-row reading, and Excel answers
 * `#VALUE!` rather than aggregating the wrong rows.
 */
export function rowsMeetingAll(size: number, conditions: RangeCondition[]): boolean[] | SpreadsheetError {
  if (conditions.some(({ range }) => range.length !== size)) return VALUE_ERROR;
  return Array.from({ length: size }, (_, row) => conditions.every(({ range, matches }) => matches(range[row] ?? "")));
}
