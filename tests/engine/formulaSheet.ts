// Formulas on a sheet of their own, "F", reading a data sheet by name — so the formula cells
// never sit inside the data they read.

import assert from "node:assert/strict";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import type { CellValue } from "../../src/engine/types.ts";
import { cellAt } from "./cellAccess.ts";

/** Each formula's value, one formula per row of column A on sheet "F". */
export function formulaValuesOn(dataSheet: SheetData, formulas: string[]): CellValue[] {
  const sheets: SheetData[] = [dataSheet, { name: "F", data: formulas.map((formula) => [{ v: formula }]) }];
  const calculated = new SpreadsheetEngine().calculateWorkbook(sheets)[1];
  assert.ok(calculated, "the formula sheet is calculated");
  return formulas.map((_, row) => cellAt(calculated.data, row, 0));
}
