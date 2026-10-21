/**
 * GROUPBY and PIVOTBY over rows of cells: grouping by key columns (text compared as UNIQUE compares
 * it), aggregating each group's values with a function the caller supplies, sorting, and laying
 * out the answer with its header row and totals.
 */

import type { CellArray, CellValue } from "../types";
import { cellIdentity, compareForSort } from "./array-functions-math";

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

/** Rows ordered by sort indexes into the row (1-based; negative is descending), each in turn, as SORT
 *  orders cells (errors last either way); ties keep their order, as Array.prototype.sort is stable. */
export function sortedRows(rows: CellArray, sortOrder: readonly number[]): CellArray {
  const positions = rows.map((_, index) => index);
  const compare = (left: number, right: number): number => {
    const decided = sortOrder.map((index) => {
      const col = Math.abs(index) - 1;
      return compareForSort(rows[left]?.[col] ?? "", rows[right]?.[col] ?? "", Math.sign(index));
    });
    return decided.find((difference) => difference !== 0) ?? 0;
  };
  return positions.toSorted(compare).map((index) => rows[index] ?? []);
}

export interface GroupByOptions {
  /** Header cells to show above the answer, or null for none. */
  headers: CellValue[] | null;
  /** 0 none; 1 a grand total; n also subtotals for the first 1 … n − 1 keys (as many as the key
   *  columns allow); negative at the top. */
  totalDepth: number;
  sortOrder: number[];
}

/** One group's row of the answer, with the data rows it aggregates. */
interface Leaf {
  row: CellValue[];
  dataRows: number[];
}

/** GROUPBY's answer: a row per group (keys, then aggregates), sorted, with totals as asked. */
export function groupByTable(keys: CellArray, values: CellArray, included: readonly boolean[], aggregate: Aggregate, options: GroupByOptions): CellArray {
  const keyWidth = keys[0]?.length ?? 0;
  const leaves = groupsOf(keys, included).map((group): Leaf => ({ row: aggregatedRow(group.key, values, group.rows, aggregate), dataRows: group.rows }));
  const sorted = sortedRows(
    leaves.map((leaf, index) => [...leaf.row, index]),
    options.sortOrder,
  ).map((row) => leaves[Number(row.at(-1))] ?? { row: [], dataRows: [] });
  const atTop = options.totalDepth < 0;
  const depth = Math.abs(options.totalDepth);
  const subtotalLevels = Math.min(depth, keyWidth) - 1;
  const layout: SubtotalLayout = { keyWidth, levels: subtotalLevels, values, aggregate, atTop };
  const allRows = included.flatMap((isIncluded, row) => (isIncluded ? [row] : []));
  const grandTotal = depth >= 1 ? [aggregatedRow(keyPrefix([TOTAL], keyWidth), values, allRows, aggregate)] : [];
  const groupRows = withSubtotals(sorted, 1, layout);
  const body = atTop ? [...grandTotal, ...groupRows] : [...groupRows, ...grandTotal];
  return options.headers ? [options.headers, ...body] : body;
}

/** The first cells of a key, then blanks to the key's width. */
const keyPrefix = (cells: CellValue[], keyWidth: number): CellValue[] => [...cells, ...Array.from({ length: keyWidth - cells.length }, () => "")];

interface SubtotalLayout {
  keyWidth: number;
  levels: number;
  values: CellArray;
  aggregate: Aggregate;
  atTop: boolean;
}

/** The leaves' rows with a subtotal for each first `prefix` keys, then for each longer prefix up to
 *  `levels`, each after its rows (before them when `atTop`). Blocks keep the order the sorted leaves
 *  meet them in. */
function withSubtotals(leaves: Leaf[], prefix: number, layout: SubtotalLayout): CellArray {
  if (prefix > layout.levels) return leaves.map((leaf) => leaf.row);
  const identityOf = (leaf: Leaf): string => JSON.stringify(leaf.row.slice(0, prefix).map(cellIdentity));
  const blocks = leaves.reduce((grouped, leaf) => grouped.set(identityOf(leaf), [...(grouped.get(identityOf(leaf)) ?? []), leaf]), new Map<string, Leaf[]>());
  return Array.from(blocks.values()).flatMap((block) => {
    const inner = withSubtotals(block, prefix + 1, layout);
    const key = keyPrefix(block[0]?.row.slice(0, prefix) ?? [], layout.keyWidth);
    const subtotal = aggregatedRow(
      key,
      layout.values,
      block.flatMap((leaf) => leaf.dataRows),
      layout.aggregate,
    );
    return layout.atTop ? [subtotal].concat(inner) : inner.concat([subtotal]);
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
  const cell = (rows: readonly number[]): CellValue => (rows.length === 0 ? "" : aggregate(columnAt(values, 0, rows)));
  const rowGroups = sortedGroups(groupsOf(rowKeys, included), options.rowSortOrder, cell);
  const columnGroups = sortedGroups(groupsOf(columnKeys, included), options.columnSortOrder, cell);
  const [rowWidth, columnDepth] = [rowKeys[0]?.length ?? 0, columnKeys[0]?.length ?? 0];
  const allRows = included.flatMap((isIncluded, row) => (isIncluded ? [row] : []));
  const columnSets = new Map(columnGroups.map((group) => [group, new Set(group.rows)]));
  // The rows with both keys: the row group's rows that are also in the column group, a total taking all.
  const both = (rowGroup: Group | null, columnGroup: Group | null): number[] => {
    const inColumn = columnGroup === null ? null : columnSets.get(columnGroup);
    return (rowGroup?.rows ?? allRows).filter((row) => inColumn === null || inColumn === undefined || inColumn.has(row));
  };
  const columns: (Group | null)[] = withTotal(columnGroups, options.columnTotals);
  const rows: (Group | null)[] = withTotal(rowGroups, options.rowTotals);
  const blankRowKey = Array.from({ length: rowWidth }, (): CellValue => "");
  const headerRows = Array.from({ length: columnDepth }, (_, level) =>
    blankRowKey.concat(columns.map((group) => (group === null ? (level === 0 ? TOTAL : "") : (group.key[level] ?? "")))),
  );
  const bodyRows = rows.map((rowGroup) =>
    (rowGroup === null ? [TOTAL, ...blankRowKey.slice(1)] : rowGroup.key).concat(columns.map((columnGroup) => cell(both(rowGroup, columnGroup)))),
  );
  return [...headerRows, ...bodyRows];
}

/** Groups sorted by their key cells, then their total (1-based indexes into key and total; negative
 *  is descending). */
function sortedGroups(groups: Group[], sortOrder: readonly number[], totalOf: (rows: readonly number[]) => CellValue): Group[] {
  const sortedKeys = sortedRows(
    groups.map((group, index) => [...group.key, totalOf(group.rows), index]),
    sortOrder,
  );
  return sortedKeys.map((row) => groups[Number(row.at(-1))] ?? { key: [], rows: [] });
}

/** The groups with a total (null) after them, before them when `depth` is negative, or none at 0. */
const withTotal = (groups: Group[], depth: number): (Group | null)[] => {
  if (depth === 0) return groups;
  return depth < 0 ? [null, ...groups] : [...groups, null];
};
