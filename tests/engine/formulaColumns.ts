// A sheet with data columns from column A and one formula per row in the column after them.

import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import type { CellValue } from "../../src/engine/types.ts";
import { cellAt } from "./cellAccess.ts";

/** Each formula's value, with `columns` from column A and the formulas in the column after them. */
export function valuesOf(formulas: string[], columns: (number | string)[][] = []): CellValue[] {
  const height = Math.max(formulas.length, ...columns.map((column) => column.length));
  const data = Array.from({ length: height }, (_, row) => [...columns.map((column) => ({ v: column[row] ?? "" })), { v: formulas[row] ?? "" }]);
  const grid = new SpreadsheetEngine().calculate({ name: "S", data } satisfies SheetData).data;
  return formulas.map((_, row) => cellAt(grid, row, columns.length));
}
