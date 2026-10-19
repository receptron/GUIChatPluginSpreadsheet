// A calculated range of a saved workbook, for another plugin to draw from — a
// chart that follows the sheet instead of holding a copy of its numbers. The
// workbook stores formulas, not results, so the range is calculated here with
// the same engine the View uses.

import type { FileOps } from "gui-chat-protocol";
// The engine index, not calculator.ts alone: it is what registers the functions.
import { isRecord } from "../engine/guards";
import { calculateSheet, normalizeData, parseRangeBounds, parseSingleCellRef, type SheetData, type StoredCellValue } from "../engine";
import { calculateWith, loadCustomFunctions, NO_CUSTOM_FUNCTIONS, type CustomFunctionSet } from "../engine/customFunctions";
import { isSpreadsheetArtifactPath, toArtifactsRelative } from "./paths";
import { readSheets } from "./sheetGuards";
import type { SpreadsheetSheet } from "./types";

/** One cell as a chart reads it: a number to plot, a label, or nothing. */
export type RangeCell = string | number | null;

/** Larger ranges are refused rather than calculated: a chart of a whole column
 *  (`A1:A1048576`) would build a million-row grid to draw a few hundred points. */
export const MAX_RANGE_CELLS = 100_000;

interface Rectangle {
  sheetName: string | null;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

// `'Q1 Data'!` → `Q1 Data`, `Data!` → `Data`, `` → null (the first sheet).
const sheetNameOf = (prefix: string): string | null => {
  if (!prefix) return null;
  const name = prefix.slice(0, -1);
  return name.startsWith("'") && name.endsWith("'") ? name.slice(1, -1).replaceAll("''", "'") : name;
};

/** `Data!B2:C13`, `'Q1 Data'!A1:B5`, `A1:B5` or a single cell, as 0-based inclusive bounds. */
export function parseRange(range: string): Rectangle | null {
  const bang = range.lastIndexOf("!");
  const body = range.slice(bang + 1);
  const bounds = parseRangeBounds(body.includes(":") ? range : `${range}:${body}`);
  if (!bounds || !parseSingleCellRef(body.split(":")[0] ?? "")) return null;
  return {
    sheetName: sheetNameOf(bounds.sheetPrefix),
    startRow: Math.min(bounds.startRow, bounds.endRow) - 1,
    endRow: Math.max(bounds.startRow, bounds.endRow) - 1,
    startCol: Math.min(bounds.startCol, bounds.endCol),
    endCol: Math.max(bounds.startCol, bounds.endCol),
  };
}

// A number format has no date or time letters: `#,##0`, `0.0%`, `$#,##0.00`.
const DATE_OR_TIME_LETTERS = /[ymdhs]/i;

const numberFormatOf = (cell: unknown): boolean => isRecord(cell) && typeof cell["f"] === "string" && cell["f"] !== "" && !DATE_OR_TIME_LETTERS.test(cell["f"]);

/**
 * The value a chart should draw for one cell. A number keeps its number even
 * when a number format turned it into text for display (`1,200`, `25.0%`), so
 * it can be plotted. A date keeps its displayed text, so an axis reads
 * `2026-01-15` rather than the serial `46037`. Text and error codes are labels.
 */
export function rangeCellValue(storedCell: unknown, calculated: StoredCellValue | undefined, displayed: StoredCellValue | undefined): RangeCell {
  if (displayed === undefined || displayed === "") return null;
  if (typeof displayed === "number") return displayed;
  if (typeof calculated === "number" && numberFormatOf(storedCell)) return calculated;
  return typeof displayed === "boolean" ? String(displayed).toUpperCase() : displayed;
}

const toEngineSheet = (sheet: SpreadsheetSheet): SheetData => ({ name: sheet.name, data: normalizeData(sheet.data) });

const rowsOf = ({ startRow, endRow }: Rectangle): number[] => Array.from({ length: endRow - startRow + 1 }, (_, offset) => startRow + offset);
const colsOf = ({ startCol, endCol }: Rectangle): number[] => Array.from({ length: endCol - startCol + 1 }, (_, offset) => startCol + offset);

/**
 * The calculated values of `range` in a workbook, row by row. Cells beyond the
 * sheet's data read as `null`, so the result is always the rectangle asked for.
 * Throws when the range is malformed, too large, or names a sheet the workbook
 * does not have.
 */
export function calculatedRange(sheets: SpreadsheetSheet[], range: string, functions: CustomFunctionSet = NO_CUSTOM_FUNCTIONS): RangeCell[][] {
  const rectangle = parseRange(range.trim());
  if (!rectangle) throw new Error(`"${range}" is not a range such as Data!A1:C13`);
  const cellCount = (rectangle.endRow - rectangle.startRow + 1) * (rectangle.endCol - rectangle.startCol + 1);
  if (cellCount > MAX_RANGE_CELLS) throw new Error(`"${range}" has ${cellCount} cells; the limit is ${MAX_RANGE_CELLS}`);
  const index = rectangle.sheetName === null ? 0 : sheets.findIndex((sheet) => sheet.name === rectangle.sheetName);
  const sheet = sheets[index];
  if (index < 0 || !sheet) throw new Error(`the spreadsheet has no sheet named "${rectangle.sheetName ?? ""}"`);
  const engineSheets = sheets.map(toEngineSheet);
  const target = engineSheets[index] ?? toEngineSheet(sheet);
  // Both passes: the raw one keeps a formatted number plottable, the display one gives a date its text.
  // One calculateWith for both passes: they are one read, and share one time budget.
  const { calculated, displayed } = calculateWith(functions, () => ({
    calculated: calculateSheet(target, engineSheets, { skipFormatting: true }).data,
    displayed: calculateSheet(target, engineSheets).data,
  }));
  return rowsOf(rectangle).map((row) =>
    colsOf(rectangle).map((col) => rangeCellValue(target.data[row]?.[col], asStored(calculated[row]?.[col]), asStored(displayed[row]?.[col]))),
  );
}

// The display pass turns error values into their codes; the raw pass keeps the
// error object, which a chart has no use for beyond "not a number".
const asStored = (value: unknown): StoredCellValue | undefined =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;

/** `calculatedRange` of the workbook saved at `path` (`artifacts/spreadsheets/…json`). */
export async function readCalculatedRange(artifacts: FileOps, path: string, range: string): Promise<RangeCell[][]> {
  if (!isSpreadsheetArtifactPath(path)) throw new Error("path must be a .json file under artifacts/spreadsheets/");
  const sheets = readSheets(JSON.parse(await artifacts.read(toArtifactsRelative(path))));
  if (!sheets) throw new Error(`${path} does not hold an array of sheets`);
  const functions = await loadCustomFunctions(sheets);
  try {
    return calculatedRange(sheets, range, functions);
  } finally {
    functions.dispose();
  }
}
