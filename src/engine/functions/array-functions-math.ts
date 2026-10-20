/**
 * The rules of the functions that build and reshape tables: SORT, SORTBY, UNIQUE, SEQUENCE,
 * TRANSPOSE, CHOOSECOLS, CHOOSEROWS, HSTACK, VSTACK, TAKE and DROP. Each takes and answers rows of
 * cells; an answer with no cells is #CALC!, an argument out of range #VALUE!, as in Excel.
 */

import { CALC_ERROR, NA_ERROR, VALUE_ERROR, isSpreadsheetErrorValue, type SpreadsheetError } from "../spreadsheet-errors";
import { compareCellValues } from "../textComparison";
import { collationIdentity } from "../textCollation";
import type { CellArray, CellValue } from "../types";
import { fitsInSheet } from "../cellArray";

type TableResult = CellArray | SpreadsheetError;

const ASCENDING = 1;
const DESCENDING = -1;

const widthOf = (table: CellArray): number => table.reduce((widest, row) => Math.max(widest, row.length), 0);

export const transpose = (table: CellArray): CellArray => Array.from({ length: widthOf(table) }, (_, col) => table.map((row) => row[col] ?? NA_ERROR));

/** Excel's sort order — numbers, text, logical values — in `order`, with errors after all of
 *  them whichever way it runs. */
function compareForSort(left: CellValue, right: CellValue, order: number): number {
  const [leftError, rightError] = [isSpreadsheetErrorValue(left), isSpreadsheetErrorValue(right)];
  if (leftError || rightError) return Number(leftError) - Number(rightError);
  return order * compareCellValues(left, right);
}

/** One sort key: the cell each row is ordered by, and the direction. */
interface SortKey {
  values: CellValue[];
  order: number;
}

const isOrder = (order: number): boolean => order === ASCENDING || order === DESCENDING;

/** The rows reordered by the keys in turn, ties kept in their original order (the sort is stable). */
function sortedByKeys(rows: CellArray, keys: SortKey[]): CellArray {
  const positions = rows.map((_, index) => index);
  const byKeys = (left: number, right: number): number =>
    keys.reduce((decided, { values, order }) => decided || compareForSort(values[left] ?? "", values[right] ?? "", order), 0);
  return [...positions].sort(byKeys).map((index) => rows[index] ?? []);
}

/** SORT: by the `index`-th column (1-based), or the `index`-th row when `byColumn`. */
export function sortTable(table: CellArray, index: number, order: number, byColumn: boolean): TableResult {
  const rows = byColumn ? transpose(table) : table;
  const column = Math.trunc(index);
  if (!isOrder(order) || column < 1 || column > widthOf(rows)) return VALUE_ERROR;
  const sorted = sortedByKeys(rows, [{ values: rows.map((row) => row[column - 1] ?? ""), order }]);
  return byColumn ? transpose(sorted) : sorted;
}

/** A SORTBY key as written: a column of one value per row, or a row of one per column. */
export interface ByArray {
  table: CellArray;
  order: number;
}

/** SORTBY: by each key in turn. All keys are columns as tall as the table (its rows are sorted) or
 *  all are rows as wide as it (its columns are); anything else is #VALUE!. */
export function sortTableBy(table: CellArray, byArrays: ByArray[]): TableResult {
  if (byArrays.some(({ order }) => !isOrder(order))) return VALUE_ERROR;
  const tall = byArrays.every(({ table: key }) => widthOf(key) === 1 && key.length === table.length);
  const wide = byArrays.every(({ table: key }) => key.length === 1 && widthOf(key) === widthOf(table));
  if (!tall && !wide) return VALUE_ERROR;
  const keys = byArrays.map(({ table: key, order }) => ({ values: tall ? key.map((row) => row[0] ?? "") : (key[0] ?? []), order }));
  return tall ? sortedByKeys(table, keys) : transpose(sortedByKeys(transpose(table), keys));
}

/** A cell's identity for UNIQUE: two cells share it exactly when Excel finds them equal. */
function cellIdentity(cell: CellValue): string {
  if (isSpreadsheetErrorValue(cell)) return `e:${cell.code}`;
  if (typeof cell === "string") return `t:${collationIdentity(cell)}`;
  return `${typeof cell}:${String(cell)}`;
}

/** UNIQUE: the distinct rows (columns when `byColumn`) in their first order, compared as Excel
 *  compares cells (text without regard to case); with `exactlyOnce`, those that occur once. */
export function uniqueTable(table: CellArray, byColumn: boolean, exactlyOnce: boolean): TableResult {
  const rows = byColumn ? transpose(table) : table;
  const identities = rows.map((row) => JSON.stringify(row.map(cellIdentity)));
  const counts = identities.reduce((tally, identity) => tally.set(identity, (tally.get(identity) ?? 0) + 1), new Map<string, number>());
  const firstAt = identities.reduce((first, identity, index) => (first.has(identity) ? first : first.set(identity, index)), new Map<string, number>());
  const kept = rows.filter((_, index) => {
    const identity = identities[index] ?? "";
    return exactlyOnce ? counts.get(identity) === 1 : firstAt.get(identity) === index;
  });
  if (kept.length === 0) return CALC_ERROR;
  return byColumn ? transpose(kept) : kept;
}

/** SEQUENCE: `rows` × `columns` numbers from `start`, `step` apart, row by row. A negative size, or
 *  one larger than a sheet holds, is #VALUE!; a zero one #CALC!. */
export function sequence(rows: number, columns: number, start: number, step: number): TableResult {
  const [height, width] = [Math.trunc(rows), Math.trunc(columns)];
  if (height < 0 || width < 0 || !fitsInSheet(height, width)) return VALUE_ERROR;
  if (height === 0 || width === 0) return CALC_ERROR;
  return Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, col) => start + (row * width + col) * step));
}

/** The 0-based positions CHOOSEROWS / CHOOSECOLS pick: 1 is the first, -1 the last; 0 or past the
 *  end is #VALUE!. */
function chosenPositions(picks: number[], size: number): number[] | SpreadsheetError {
  const positions = picks.map(Math.trunc).map((pick) => (pick < 0 ? size + pick : pick - 1));
  return positions.some((position) => position < 0 || position >= size) ? VALUE_ERROR : positions;
}

export function chooseRows(table: CellArray, picks: number[]): TableResult {
  const positions = chosenPositions(picks, table.length);
  return Array.isArray(positions) ? positions.map((position) => table[position] ?? []) : positions;
}

export function chooseColumns(table: CellArray, picks: number[]): TableResult {
  const chosen = chooseRows(transpose(table), picks);
  return Array.isArray(chosen) ? transpose(chosen) : chosen;
}

/** HSTACK: side by side, a shorter table filled down with #N/A. */
export function stackHorizontally(tables: CellArray[]): CellArray {
  const height = tables.reduce((tallest, table) => Math.max(tallest, table.length), 0);
  return Array.from({ length: height }, (_, row) =>
    tables.flatMap((table) => Array.from({ length: widthOf(table) }, (_, col) => table[row]?.[col] ?? NA_ERROR)),
  );
}

/** VSTACK: one under another, a narrower table filled across with #N/A. */
export function stackVertically(tables: CellArray[]): CellArray {
  const width = tables.reduce((widest, table) => Math.max(widest, widthOf(table)), 0);
  return tables.flatMap((table) => table.map((row) => Array.from({ length: width }, (_, col) => row[col] ?? NA_ERROR)));
}

/** The kept part of a line of `size` for TAKE: the first `count`, or the last when negative. */
const takenSpan = (count: number, size: number): [number, number] => {
  const kept = Math.min(Math.abs(Math.trunc(count)), size);
  return count < 0 ? [size - kept, size] : [0, kept];
};

/** The kept part for DROP: all but the first `count`, or all but the last when negative. */
const droppedSpan = (count: number, size: number): [number, number] => {
  const dropped = Math.min(Math.abs(Math.trunc(count)), size);
  return count < 0 ? [0, size - dropped] : [dropped, size];
};

function sliced(table: CellArray, rowSpan: [number, number], colSpan: [number, number]): TableResult {
  const rows = table.slice(...rowSpan).map((row) => row.slice(...colSpan));
  return rows.length === 0 || widthOf(rows) === 0 ? CALC_ERROR : rows;
}

/** TAKE: the first (or last, when negative) rows and columns; a count of 0 is #CALC!, one past
 *  the table's size takes all of it. A count left out keeps every row or column. */
export function takeFrom(table: CellArray, rows: number | undefined, columns: number | undefined): TableResult {
  const width = widthOf(table);
  return sliced(table, rows === undefined ? [0, table.length] : takenSpan(rows, table.length), columns === undefined ? [0, width] : takenSpan(columns, width));
}

/** DROP: all but the first (or last, when negative) rows and columns; dropping everything is #CALC!. */
export function dropFrom(table: CellArray, rows: number | undefined, columns: number | undefined): TableResult {
  const width = widthOf(table);
  return sliced(table, droppedSpan(rows ?? 0, table.length), droppedSpan(columns ?? 0, width));
}
