/**
 * Pure rules for the regression and covariance functions (FORECAST.LINEAR, TREND, STEYX,
 * COVARIANCE.S/.P), separated from the range-reading handlers so they can be tested directly.
 */

import { DIV_ZERO_ERROR, isSpreadsheetErrorValue, NA_ERROR, REF_ERROR, VALUE_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import { holdsNumber } from "../numericCoercion";
import { toNumber } from "../registry";
import type { CellValue } from "../types";
import { mean, slope, sumOfCrossDeviations, sumOfSquaredDeviations, type NumericPairs } from "./analysis-math";

const MIN_STEYX_PAIRS = 3;
const MIN_SAMPLE_PAIRS = 2;

/** FORECAST.LINEAR: the least-squares line's value at `x`. Ranges with no pair of numbers are
 *  #N/A, as Excel answers for empty ranges; an x that never varies has no line: #DIV/0!. */
export function forecastLinear(pairs: NumericPairs, x: number): number | SpreadsheetError {
  if (pairs.ys.length === 0) return NA_ERROR;
  const fitted = slope(pairs);
  return typeof fitted === "number" ? mean(pairs.ys) + fitted * (x - mean(pairs.xs)) : fitted;
}

/** STEYX: the standard error of the y predicted by the least-squares line. */
export function standardErrorOfEstimate(pairs: NumericPairs): number | SpreadsheetError {
  const count = pairs.ys.length;
  if (count === 0) return NA_ERROR;
  const xSpread = sumOfSquaredDeviations(pairs.xs);
  if (count < MIN_STEYX_PAIRS || xSpread === 0) return DIV_ZERO_ERROR;
  // Each residual is summed rather than taken as Syy − Sxy²/Sxx, which cancels to noise for a close fit.
  const fittedSlope = sumOfCrossDeviations(pairs) / xSpread;
  const [yCenter, xCenter] = [mean(pairs.ys), mean(pairs.xs)];
  const residuals = pairs.ys.reduce((sum, y, index) => sum + (y - yCenter - fittedSlope * ((pairs.xs[index] ?? xCenter) - xCenter)) ** 2, 0);
  return Math.sqrt(residuals / (count - 2));
}

/** COVARIANCE.P: the mean product of the deviations, divided by n. */
export function populationCovariance(pairs: NumericPairs): number | SpreadsheetError {
  return pairs.ys.length === 0 ? DIV_ZERO_ERROR : sumOfCrossDeviations(pairs) / pairs.ys.length;
}

/** COVARIANCE.S: divided by n - 1, so it needs two pairs. */
export function sampleCovariance(pairs: NumericPairs): number | SpreadsheetError {
  return pairs.ys.length < MIN_SAMPLE_PAIRS ? DIV_ZERO_ERROR : sumOfCrossDeviations(pairs) / (pairs.ys.length - 1);
}

/** The positions 1..n, TREND's known_x when it is omitted. */
export const defaultKnownXs = (count: number): number[] => Array.from({ length: count }, (_, index) => index + 1);

/**
 * TREND at one new x. Unlike FORECAST it reads the ranges whole, as LINEST does: ranges of
 * different sizes are #REF!, an error cell is that error, and a blank or text cell is #VALUE!
 * rather than a skipped row. With a constant, an x that never varies is collinear with it and is
 * dropped, as LINEST drops it, leaving the mean of y; through the origin only an all-zero x is.
 */
export function trendAt(knownYs: CellValue[], knownXs: CellValue[], newX: number, withConstant: boolean): number | SpreadsheetError {
  if (knownYs.length !== knownXs.length) return REF_ERROR;
  const cells = [...knownYs, ...knownXs];
  const firstError = cells.find(isSpreadsheetErrorValue);
  if (firstError) return firstError;
  if (knownYs.length === 0 || !cells.every(holdsNumber)) return VALUE_ERROR;
  const pairs = { ys: knownYs.map(toNumber), xs: knownXs.map(toNumber) };
  return withConstant ? trendWithConstant(pairs, newX) : trendThroughOrigin(pairs, newX);
}

function trendWithConstant(pairs: NumericPairs, newX: number): number {
  const xSpread = sumOfSquaredDeviations(pairs.xs);
  const yCenter = mean(pairs.ys);
  return xSpread === 0 ? yCenter : yCenter + (sumOfCrossDeviations(pairs) / xSpread) * (newX - mean(pairs.xs));
}

function trendThroughOrigin({ ys, xs }: NumericPairs, newX: number): number {
  const xSquares = xs.reduce((sum, x) => sum + x * x, 0);
  const products = ys.reduce((sum, y, index) => sum + y * (xs[index] ?? 0), 0);
  return xSquares === 0 ? 0 : (products / xSquares) * newX;
}
