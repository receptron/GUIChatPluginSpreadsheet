// What a formula answers, calculated in the small sheets the engine tests build around it.

import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import type { CellValue } from "../../src/engine/types.ts";
import { cellAt } from "./cellAccess.ts";

/** What `formula` answers alone in A1. */
export const formulaValue = (formula: string): CellValue =>
  cellAt(new SpreadsheetEngine().calculate({ name: "S", data: [[{ v: formula }]] } satisfies SheetData).data, 0, 0);

/** What `formula` answers in column A of the row after `rows`. */
export function valueBelow(rows: (string | number)[][], formula: string): CellValue {
  const data = rows.map((row) => row.map((value) => ({ v: value })));
  data.push([{ v: formula }]);
  return cellAt(new SpreadsheetEngine().calculate({ name: "S", data }).data, data.length - 1, 0);
}

/** What `formula`, written beside `rows` (a column apart, in the first row), spills. */
export function spilledBeside(formula: string, rows: CellValue[][]): CellValue[][] {
  const width = rows[0]?.length ?? 0;
  const data = rows.map((row, r) => [...row, "", r === 0 ? formula : ""].map((v) => ({ v })));
  const [sheet] = new SpreadsheetEngine().calculateWorkbook([{ name: "S", data }]);
  return (sheet?.data ?? []).map((row) => row.slice(width + 1)).filter((row) => row.some((cell) => cell !== ""));
}

/** The cells of a `rows` × `columns` block from A1, row by row. */
export const rowMajorCells = (rows: number, columns: number): { row: number; col: number }[] =>
  Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_cell, col) => ({ row, col }))).flat();
