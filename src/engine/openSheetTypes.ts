/**
 * The shapes one calculation passes between the sheets it opens: a cell's position, a sheet opened
 * for reading, and where a reference reads from.
 */
import type { CellValue, SpreadsheetCell } from "./types";
import { type ExtentReach, type SheetExtent } from "./wholeReferences";

// Where a cell sits in the grid of the sheet it belongs to, carrying the row so a formula's result is
// written back without re-indexing.
export interface CellPosition {
  cells: any[];
  row: number;
  col: number;
}

/** Reads one cell of a sheet, calculating it if it is a formula. */
export type CellReader = (cell: unknown, position?: CellPosition) => CellValue;

/** A sheet opened during one calculation: its grid, and the reader that calculates a cell of it on
 *  demand. Another sheet's formula reads it cell by cell rather than calculating it whole, so two
 *  sheets that refer to each other work as long as no CELL depends on itself (#130). */
export interface OpenSheet {
  calculated: (SpreadsheetCell | CellValue)[][];
  read: CellReader;
  /** Calculates first every formula that could spill into the cell, so a read finds what spilled there. */
  ensureSpillsReaching: (row: number, col: number) => void;
  /** Whether the cell holds part of a table spilled from another cell. */
  isSpilled: (row: number, col: number) => boolean;
  /** How far the sheet reaches, spilled tables included that could reach `reach`. */
  extent: (reach?: ExtentReach) => SheetExtent;
}

/** The sheets opened so far in one calculation, by name. */
export type OpenSheets = Map<string, OpenSheet>;

// The grid a reference should read from, the sheet-name-stripped ref, and the reader for that sheet.
export interface ResolvedSheetRef {
  sheetData: (SpreadsheetCell | CellValue)[][];
  ref: string;
  read: CellReader;
  sheet: OpenSheet;
}
