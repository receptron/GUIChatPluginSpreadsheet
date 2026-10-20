/**
 * A formula's value when it is a table rather than one value: rows of cells. A function returns
 * one, the calculator spills it from the formula's cell, and wherever a single value is needed it
 * stands for its only cell or is #VALUE!.
 */

import { NA_ERROR, VALUE_ERROR } from "./spreadsheet-errors";
import type { CellArray, CellValue, FormulaValue } from "./types";

export const isCellArray = (value: unknown): value is CellArray => Array.isArray(value);

/** `value` as the calculator holds it: an array with no cells is #VALUE!, a 1×1 array its only
 *  cell, and the short rows of a ragged one are filled with #N/A, as Excel fills them. */
export function normalizedValue(value: FormulaValue): FormulaValue {
  if (!isCellArray(value)) return value;
  const width = value.reduce((widest, row) => Math.max(widest, row.length), 0);
  if (width === 0) return VALUE_ERROR;
  const [firstRow] = value;
  if (value.length === 1 && firstRow?.length === 1) return firstRow[0] ?? VALUE_ERROR;
  return value.map((row) => (row.length === width ? row : [...row, ...Array.from({ length: width - row.length }, () => NA_ERROR)]));
}

/** The one value `value` stands for where a single value is needed: its only cell, or #VALUE!
 *  for an array of more than one. */
export function scalarOf(value: FormulaValue): CellValue {
  const normalized = normalizedValue(value);
  return isCellArray(normalized) ? VALUE_ERROR : normalized;
}

/** Every cell of `value` in reading order; a single value is one cell. */
export const cellsOf = (value: FormulaValue): CellValue[] => (isCellArray(value) ? value.flat() : [value]);
