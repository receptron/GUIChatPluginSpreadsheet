/**
 * GROUPBY and PIVOTBY over rows of cells: grouping by key columns (text compared as UNIQUE compares
 * it), aggregating each group's values with a function the caller supplies, sorting, and laying
 * out the answer with its header row and totals.
 */

import { compareCellValues } from "../textComparison";
import type { CellArray, CellValue } from "../types";
import { cellIdentity } from "./array-functions-math";

export type Aggregate = (values: CellArray) => CellValue;

const TOTAL = "Total";

/** A group: its key cells and the rows of the data it holds. */
export interface Group {
  key: CellValue[];
  rows: number[];
}

/** The groups of `keys` (one row of key cells per data row) over the rows `included`, in the order
 *  each key first appears. */
export function groupsOf(keys: CellArray, included: readonly boolean[]): Group[] {
  const byIdentity = new Map<string, Group>();
  keys.forEach((key, row) => {
    if (!included[row]) return;
    const identity = JSON.stringify(key.map(cellIdentity));
    const group = byIdentity.get(identity) ?? { key, rows: [] };
    group.rows.push(row);
    byIdentity.set(identity, group);
  });
  return Array.from(byIdentity.values());
}

/** Column `col` of `values` at `rows`, as a column. */
const columnAt = (values: CellArray, col: number, rows: readonly number[]): CellArray => rows.map((row) => [values[row]?.[col] ?? ""]);

/** One output row: the key cells, then each value column aggregated over `rows`. */
const aggregatedRow = (key: CellValue[], values: CellArray, rows: readonly number[], aggregate: Aggregate): CellValue[] => [
  ...key,
  ...Array.from({ length: values[0]?.length ?? 0 }, (_, col) => aggregate(columnAt(values, col, rows))),
];

/** Rows ordered by sort indexes into the row (1-based; negative is descending), each in turn; ties
 *  keep their order, as Array.prototype.sort is stable. */
export function sortedRows(rows: CellArray, sortOrder: readonly number[]): CellArray {
  const positions = rows.map((_, index) => index);
  const compare = (left: number, right: number): number => {
    const decided = sortOrder.map((index) => {
      const col = Math.abs(index) - 1;
      return Math.sign(index) * compareCellValues(rows[left]?.[col] ?? "", rows[right]?.[col] ?? "");
    });
    return decided.find((difference) => difference !== 0) ?? 0;
  };
  return positions.sort(compare).map((index) => rows[index] ?? []);
}

export interface GroupByOptions {
  /** Header cells to show above the answer, or null for none. */
  headers: CellValue[] | null;
  /** 0 none; 1 a grand total; 2 also a subtotal for each first key (needs two key columns or more); negative at the top. */
  totalDepth: number;
  sortOrder: number[];
}

/** GROUPBY's answer: a row per group (keys, then aggregates), sorted, with totals as asked. */
export function groupByTable(keys: CellArray, values: CellArray, included: readonly boolean[], aggregate: Aggregate, options: GroupByOptions): CellArray {
  const keyWidth = keys[0]?.length ?? 0;
  const blankKey = (first: CellValue): CellValue[] => [first, ...Array.from({ length: keyWidth - 1 }, () => "")];
  const leafRows = sortedRows(
    groupsOf(keys, included).map((group) => aggregatedRow(group.key, values, group.rows, aggregate)),
    options.sortOrder,
  );
  const atTop = options.totalDepth < 0;
  const depth = Math.abs(options.totalDepth);
  const withSubtotals = depth >= 2 && keyWidth >= 2 ? subtotalled(leafRows, keys, values, included, aggregate, blankKey, atTop) : leafRows;
  const allRows = included.flatMap((isIncluded, row) => (isIncluded ? [row] : []));
  const grandTotal = depth >= 1 ? [aggregatedRow(blankKey(TOTAL), values, allRows, aggregate)] : [];
  const body = atTop ? [...grandTotal, ...withSubtotals] : [...withSubtotals, ...grandTotal];
  return options.headers ? [options.headers, ...body] : body;
}

/** The sorted rows with, for each first key, a subtotal row after its rows (before them when `atTop`). */
function subtotalled(
  rows: CellArray,
  keys: CellArray,
  values: CellArray,
  included: readonly boolean[],
  aggregate: Aggregate,
  blankKey: (first: CellValue) => CellValue[],
  atTop: boolean,
): CellArray {
  const firstKeys = groupsOf(
    keys.map((key) => [key[0] ?? ""]),
    included,
  );
  // The first keys in the order the sorted rows meet them, so the blocks keep the sort.
  const order = rows.map((row) => cellIdentity(row[0] ?? "")).filter((identity, index, all) => all.indexOf(identity) === index);
  return order.flatMap((identity) => {
    const block = rows.filter((row) => cellIdentity(row[0] ?? "") === identity);
    const group = firstKeys.find((candidate) => cellIdentity(candidate.key[0] ?? "") === identity);
    const subtotal = aggregatedRow(blankKey(group?.key[0] ?? ""), values, group?.rows ?? [], aggregate);
    return atTop ? [subtotal, ...block] : [...block, subtotal];
  });
}

export interface PivotOptions {
  rowTotals: number;
  columnTotals: number;
  rowSortOrder: number[];
  columnSortOrder: number[];
}

/** PIVOTBY's answer for one value column: column keys across the top (a header row per column
 *  field), row keys down the side, each cell the aggregate of the rows with both keys (blank where
 *  there are none), and a Total row and column unless asked for none (first when negative). */
export function pivotTable(
  rowKeys: CellArray,
  columnKeys: CellArray,
  values: CellArray,
  included: readonly boolean[],
  aggregate: Aggregate,
  options: PivotOptions,
): CellArray {
  const rowGroups = sortedGroups(groupsOf(rowKeys, included), options.rowSortOrder);
  const columnGroups = sortedGroups(groupsOf(columnKeys, included), options.columnSortOrder);
  const [rowWidth, columnDepth] = [rowKeys[0]?.length ?? 0, columnKeys[0]?.length ?? 0];
  const allRows = included.flatMap((isIncluded, row) => (isIncluded ? [row] : []));
  const cell = (rows: readonly number[]): CellValue => (rows.length === 0 ? "" : aggregate(columnAt(values, 0, rows)));
  const both = (rowGroup: Group | null, columnGroup: Group | null): number[] =>
    allRows.filter((row) => (rowGroup === null || rowGroup.rows.includes(row)) && (columnGroup === null || columnGroup.rows.includes(row)));
  const columns: (Group | null)[] = withTotal(columnGroups, options.columnTotals);
  const rows: (Group | null)[] = withTotal(rowGroups, options.rowTotals);
  const blankRowKey = Array.from({ length: rowWidth }, (): CellValue => "");
  const headerRows = Array.from({ length: columnDepth }, (_, level) => [
    ...blankRowKey,
    ...columns.map((group) => (group === null ? (level === 0 ? TOTAL : "") : (group.key[level] ?? ""))),
  ]);
  const bodyRows = rows.map((rowGroup) => [
    ...(rowGroup === null ? [TOTAL, ...blankRowKey.slice(1)] : rowGroup.key),
    ...columns.map((columnGroup) => cell(both(rowGroup, columnGroup))),
  ]);
  return [...headerRows, ...bodyRows];
}

/** Groups sorted by their key cells (1-based indexes into the key; negative is descending). */
function sortedGroups(groups: Group[], sortOrder: readonly number[]): Group[] {
  const sortedKeys = sortedRows(
    groups.map((group, index) => [...group.key, index]),
    sortOrder,
  );
  return sortedKeys.map((row) => groups[Number(row.at(-1))] ?? { key: [], rows: [] });
}

/** The groups with a total (null) after them, before them when `depth` is negative, or none at 0. */
const withTotal = (groups: Group[], depth: number): (Group | null)[] => {
  if (depth === 0) return groups;
  return depth < 0 ? [null, ...groups] : [...groups, null];
};
