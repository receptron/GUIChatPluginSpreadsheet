/**
 * MMULT, MINVERSE, MDETERM, MUNIT and FREQUENCY over plain numbers. The inverse and the determinant
 * come from one LU decomposition with scaled partial pivoting (as LibreOffice computes them); a
 * matrix is singular when a pivot is exactly 0.
 */

import { NUM_ERROR, VALUE_ERROR, type SpreadsheetError } from "../spreadsheet-errors";

export type Matrix = number[][];

const isSquare = (matrix: Matrix): boolean => matrix.length > 0 && matrix.every((row) => row.length === matrix.length);

/** MMULT: rows of `left` times columns of `right`; `left`'s width must be `right`'s height. */
export function multiply(left: Matrix, right: Matrix): Matrix | SpreadsheetError {
  const inner = left[0]?.length ?? 0;
  if (inner === 0 || inner !== right.length) return VALUE_ERROR;
  const width = right[0]?.length ?? 0;
  return left.map((row) => Array.from({ length: width }, (_, col) => row.reduce((sum, value, k) => sum + value * (right[k]?.[col] ?? 0), 0)));
}

export const identity = (size: number): Matrix => Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => (row === col ? 1 : 0)));

interface Decomposition {
  /** L below the diagonal (its unit diagonal left out) and U on and above it, in one matrix. */
  lu: Matrix;
  /** The original row each row of `lu` came from. */
  rows: number[];
  /** +1 or -1: the sign the row exchanges give the determinant. */
  sign: number;
}

/** The row with the largest scaled entry in column `k` from row `k` down, or -1 when they are all 0. */
function pivotRow(lu: Matrix, scales: number[], k: number): number {
  const candidates = lu.slice(k).map((row, offset) => ({ row: k + offset, size: (scales[k + offset] ?? 0) * Math.abs(row[k] ?? 0) }));
  const best = candidates.reduce((largest, candidate) => (candidate.size > largest.size ? candidate : largest), { row: -1, size: 0 });
  return best.row;
}

function swap<T>(items: T[], first: number, second: number): void {
  const held = items[first];
  const other = items[second];
  if (held === undefined || other === undefined) return;
  items[first] = other;
  items[second] = held;
}

/** The LU decomposition of a square matrix, or null when it is singular. */
function decompose(matrix: Matrix): Decomposition | null {
  const lu = matrix.map((row) => [...row]);
  // A row of zeros has an infinite scale, and then no pivot: it is found singular below.
  const scales = lu.map((row) => 1 / row.reduce((largest, value) => Math.max(largest, Math.abs(value)), 0));
  const rows = lu.map((_, index) => index);
  const state = { sign: 1, singular: false };
  lu.forEach((_, k) => {
    if (state.singular) return;
    const pivot = pivotRow(lu, scales, k);
    if (pivot === -1) {
      state.singular = true;
      return;
    }
    if (pivot !== k) {
      [lu, scales, rows].forEach((items: unknown[]) => swap(items, k, pivot));
      state.sign = -state.sign;
    }
    const pivotValue = lu[k]?.[k] ?? 0;
    lu.slice(k + 1).forEach((row) => {
      const factor = (row[k] ?? 0) / pivotValue;
      row[k] = factor;
      row.forEach((value, col) => {
        if (col > k) row[col] = value - factor * (lu[k]?.[col] ?? 0);
      });
    });
  });
  return state.singular ? null : { lu, rows, sign: state.sign };
}

/** The x with A·x = b, from A's decomposition. */
function solve({ lu, rows }: Decomposition, b: number[]): number[] {
  const n = lu.length;
  const forward = rows.map((source) => b[source] ?? 0);
  forward.forEach((_, i) => {
    forward[i] = (forward[i] ?? 0) - (lu[i] ?? []).slice(0, i).reduce((sum, value, j) => sum + value * (forward[j] ?? 0), 0);
  });
  const x = Array.from({ length: n }, () => 0);
  Array.from({ length: n }, (_, offset) => n - 1 - offset).forEach((i) => {
    const row = lu[i] ?? [];
    const above = row.slice(i + 1).reduce((sum, value, offset) => sum + value * (x[i + 1 + offset] ?? 0), 0);
    x[i] = ((forward[i] ?? 0) - above) / (row[i] ?? 1);
  });
  return x;
}

/** MINVERSE: a square matrix's inverse; one that is not square is #VALUE!, a singular one #NUM!. */
export function inverse(matrix: Matrix): Matrix | SpreadsheetError {
  if (!isSquare(matrix)) return VALUE_ERROR;
  const decomposition = decompose(matrix);
  if (!decomposition) return NUM_ERROR;
  const columns = identity(matrix.length).map((unit) => solve(decomposition, unit));
  return matrix.map((_, row) => columns.map((column) => column[row] ?? 0));
}

/** MDETERM: a square matrix's determinant, 0 for a singular one; one that is not square is #VALUE!. */
export function determinant(matrix: Matrix): number | SpreadsheetError {
  if (!isSquare(matrix)) return VALUE_ERROR;
  const decomposition = decompose(matrix);
  if (!decomposition) return 0;
  return decomposition.lu.reduce((product, row, index) => product * (row[index] ?? 0), decomposition.sign);
}

/** FREQUENCY: how many values fall at or below each bin and above the one before it, in the bins'
 *  own order, and then how many lie above every bin. With no bins, the count of the values. */
export function frequency(values: number[], bins: number[]): number[] {
  const sortedBins = bins.map((bin, index) => ({ bin, index })).sort((left, right) => left.bin - right.bin);
  const counts = Array.from({ length: bins.length + 1 }, () => 0);
  const sortedValues = [...values].sort((left, right) => left - right);
  const counted = sortedBins.reduce((cursor, { bin, index }) => {
    const reached = sortedValues.findIndex((value, position) => position >= cursor && value > bin);
    const next = reached === -1 ? sortedValues.length : reached;
    counts[index] = next - cursor;
    return next;
  }, 0);
  counts[bins.length] = sortedValues.length - counted;
  return counts;
}
