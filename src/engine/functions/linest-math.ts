/**
 * Least squares over several x variables, as LINEST, LOGEST, TREND and GROWTH fit it: the design
 * (a constant column first when there is one, then each x) is orthogonalised column by column, and
 * a column that adds nothing to the ones before it — an x collinear with them — is left out, with
 * a coefficient and standard error of 0 and one more degree of freedom, as Excel documents.
 */

import { holdsNumber } from "../numericCoercion";
import { toNumber } from "../registry";
import { isSpreadsheetErrorValue, NA_ERROR, NUM_ERROR, REF_ERROR, VALUE_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import type { CellValue } from "../types";

/** A column whose part not explained by the columns before it is this small, relative to its own
 *  size, is collinear with them; floating-point noise on an exactly collinear column is far below. */
const COLLINEAR_TOLERANCE = 1e-10;

/** The data of a fit: y, and each x variable as a column of the same length. `byRows` says the
 *  variables were read as rows (known_y a row), so a prediction for several x answers a row. */
export interface RegressionData {
  ys: number[];
  columns: number[][];
  byRows: boolean;
}

/** A fit: one coefficient per x variable (0 for one left out), the constant (0 without one), and
 *  the inverse of the normal matrix's diagonal for each kept column, which the standard errors need. */
export interface Regression {
  coefficients: number[];
  intercept: number;
  kept: boolean[];
  /** (XᵀX)⁻¹ᵢᵢ for each x variable (0 for one left out), and for the constant (null without one). */
  inverseDiagonal: number[];
  interceptInverseDiagonal: number | null;
  withConstant: boolean;
}

const dot = (left: number[], right: number[]): number => left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
const norm = (vector: number[]): number => Math.sqrt(dot(vector, vector));

/** The first error cell, or #VALUE! for a cell that is not a number, or the cells' numbers. */
function numbersOf(cells: CellValue[]): number[] | SpreadsheetError {
  const error = cells.find(isSpreadsheetErrorValue);
  if (error) return error;
  return cells.every(holdsNumber) ? cells.map(toNumber) : VALUE_ERROR;
}

const columnsOf = (grid: CellValue[][]): CellValue[][] => Array.from({ length: grid[0]?.length ?? 0 }, (_, col) => grid.map((row) => row[col] ?? ""));

/** known_y and known_x read as Excel reads them: x of y's own shape is one variable; with y one
 *  column, each column of x is a variable (one row per y); with y one row, each row of x is. x left
 *  out is 1, 2, 3, …. Any other shape is #REF!; an error cell is that error, other non-numbers #VALUE!. */
export function regressionData(yGrid: CellValue[][], xGrid: CellValue[][] | null): RegressionData | SpreadsheetError {
  const height = yGrid.length;
  const width = yGrid[0]?.length ?? 0;
  const ys = numbersOf(yGrid.flat());
  if (isSpreadsheetErrorValue(ys)) return ys;
  if (xGrid === null) return { ys, columns: [ys.map((_, index) => index + 1)], byRows: height === 1 && width > 1 };
  const xWidth = xGrid[0]?.length ?? 0;
  const xCells = numbersOf(xGrid.flat());
  if (isSpreadsheetErrorValue(xCells)) return xCells;
  if (xGrid.length === height && xWidth === width) return { ys, columns: [xCells], byRows: height === 1 && width > 1 };
  if (width === 1 && xGrid.length === height) return { ys, columns: columnsOf(xGrid).map((column) => column.map(toNumber)), byRows: false };
  if (height === 1 && xWidth === width) return { ys, columns: xGrid.map((row) => row.map(toNumber)), byRows: true };
  return REF_ERROR;
}

interface Orthogonalised {
  /** An orthogonal basis of the kept columns, not normalised, with each one's squared length, and R,
   *  unit upper triangular, with design = basis·R. Leaving the basis unnormalised keeps the
   *  arithmetic to ratios, so exact data (y = 2x) fits exactly, with no square root's rounding. */
  basis: number[][];
  squaredLengths: number[];
  r: number[][];
  kept: boolean[];
}

/** Modified Gram–Schmidt over the design's columns, leaving out each column collinear with those kept before it. */
function orthogonalise(design: number[][]): Orthogonalised {
  const result: Orthogonalised = { basis: [], squaredLengths: [], r: [], kept: [] };
  design.forEach((column) => {
    const residual = [...column];
    const shares = result.basis.map((direction, index) => {
      const share = dot(direction, residual) / (result.squaredLengths[index] ?? 1);
      direction.forEach((value, place) => (residual[place] = (residual[place] ?? 0) - share * value));
      return share;
    });
    const keep = norm(residual) > COLLINEAR_TOLERANCE * norm(column);
    result.kept.push(keep);
    if (!keep) return;
    result.r.forEach((row, index) => row.push(shares[index] ?? 0));
    result.r.push([...result.basis.map(() => 0), 1]);
    result.basis.push(residual);
    result.squaredLengths.push(dot(residual, residual));
  });
  return result;
}

/** The inverse of a unit upper-triangular matrix, by back substitution. */
function unitUpperInverse(r: number[][]): number[][] {
  const size = r.length;
  const inverse = r.map((_, row) => Array.from({ length: size }, (_, col): number => (row === col ? 1 : 0)));
  Array.from({ length: size }, (_, offset) => size - 1 - offset).forEach((row) => {
    Array.from({ length: size - row - 1 }, (_, step) => row + 1 + step).forEach((col) => {
      const known = Array.from({ length: col - row }, (_, step) => row + 1 + step).reduce((sum, k) => sum + (r[row]?.[k] ?? 0) * (inverse[k]?.[col] ?? 0), 0);
      const target = inverse[row];
      if (target) target[col] = -known;
    });
  });
  return inverse;
}

/** The least-squares fit of y on the columns, with a constant or through the origin. */
export function fitRegression({ ys, columns }: RegressionData, withConstant: boolean): Regression {
  const design = withConstant ? [ys.map(() => 1), ...columns] : columns;
  const { basis, squaredLengths, r, kept } = orthogonalise(design);
  const shares = basis.map((direction, index) => dot(direction, ys) / (squaredLengths[index] ?? 1));
  const inverse = unitUpperInverse(r);
  const solution = inverse.map((row) => dot(row, shares));
  // (XᵀX)⁻¹ = R⁻¹·D⁻¹·R⁻ᵀ, D the basis' squared lengths.
  const diagonal = inverse.map((row) => row.reduce((sum, value, index) => sum + (value * value) / (squaredLengths[index] ?? 1), 0));
  // Spread each kept column's value back to its place in the design; a column left out has 0.
  const keptPlaces = kept.flatMap((isKept, place) => (isKept ? [place] : []));
  const byPlace = (values: number[]): number[] => design.map((_, place) => values[keptPlaces.indexOf(place)] ?? 0);
  const [coefficientsByPlace, diagonalByPlace] = [byPlace(solution), byPlace(diagonal)];
  const offset = withConstant ? 1 : 0;
  return {
    coefficients: coefficientsByPlace.slice(offset),
    intercept: withConstant ? (coefficientsByPlace[0] ?? 0) : 0,
    kept: kept.slice(offset),
    inverseDiagonal: diagonalByPlace.slice(offset),
    interceptInverseDiagonal: withConstant ? (diagonalByPlace[0] ?? 0) : null,
    withConstant,
  };
}

/** The fitted value at one set of x values, one per variable. */
export const predict = (fit: Regression, xs: number[]): number => fit.intercept + dot(fit.coefficients, xs);

/** Each y the fit predicts at the data's own x. */
const fittedValues = (fit: Regression, { ys, columns }: RegressionData): number[] =>
  ys.map((_, row) =>
    predict(
      fit,
      columns.map((column) => column[row] ?? 0),
    ),
  );

const sumOfSquares = (values: number[]): number => dot(values, values);

/** A ratio that has no value when its denominator is 0: #NUM!. */
const ratio = (numerator: number, denominator: number): number | SpreadsheetError => (denominator === 0 ? NUM_ERROR : numerator / denominator);

/** LINEST's table: the coefficients from the last x to the first, then the constant; with `stats`,
 *  four more rows — their standard errors, r² and the standard error of y, F and the degrees of
 *  freedom, the regression and residual sums of squares — with #N/A where a row has no more values. */
export function linestTable(fit: Regression, data: RegressionData, stats: boolean): CellValue[][] {
  const width = fit.coefficients.length + 1;
  const coefficients = [...[...fit.coefficients].reverse(), fit.intercept];
  if (!stats) return [coefficients];
  const fitted = fittedValues(fit, data);
  const mean = data.ys.reduce((sum, y) => sum + y, 0) / data.ys.length;
  const ssresid = sumOfSquares(data.ys.map((y, index) => y - (fitted[index] ?? 0)));
  const ssreg = sumOfSquares(fit.withConstant ? fitted.map((value) => value - mean) : fitted);
  const sstotal = sumOfSquares(fit.withConstant ? data.ys.map((y) => y - mean) : data.ys);
  const keptCount = fit.kept.filter(Boolean).length;
  const df = data.ys.length - keptCount - (fit.withConstant ? 1 : 0);
  const variance = ratio(ssresid, df);
  const sey = isSpreadsheetErrorValue(variance) ? variance : Math.sqrt(variance);
  const errorOf = (inverseDiagonal: number, isKept: boolean): CellValue => {
    if (!isKept) return 0;
    return isSpreadsheetErrorValue(sey) ? sey : sey * Math.sqrt(inverseDiagonal);
  };
  const errors = fit.coefficients.map((_, index) => errorOf(fit.inverseDiagonal[index] ?? 0, fit.kept[index] ?? false)).reverse();
  const interceptError = fit.interceptInverseDiagonal === null ? NA_ERROR : errorOf(fit.interceptInverseDiagonal, true);
  const regressionMeanSquare = ratio(ssreg, keptCount);
  const f = isSpreadsheetErrorValue(regressionMeanSquare) || isSpreadsheetErrorValue(variance) ? NUM_ERROR : ratio(regressionMeanSquare, variance);
  const padded = (values: CellValue[]): CellValue[] => [...values, ...Array.from({ length: width - values.length }, () => NA_ERROR)];
  return [coefficients, [...errors, interceptError], padded([ratio(ssreg, sstotal), sey]), padded([f, df]), padded([ssreg, ssresid])];
}
