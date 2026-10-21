/**
 * Reading a range for a formula: its numbers, every cell, every cell with blanks kept, how many
 * cells are filled, and its cells row by row.
 */
import { expandRangeOrCell } from "./formulaRefs";
import type { CellValue, SpreadsheetCell, FormulaValue } from "./types";
import { cellsOf, isCellArray } from "./cellArray";
import { isSoleReference } from "./spillCandidate";
import { isRecord } from "./guards";
import { isEmptyCell } from "./cellEmpty";
import { isRangeNumber } from "./numericCoercion";
import { answersTable, type CellCoordinates } from "./registry";
import { invalidRefError } from "./formulaError";
import { isSpreadsheetErrorValue } from "./spreadsheet-errors";
import type { OpenSheet, ResolvedSheetRef } from "./openSheetTypes";

/** How a range is read: only its numbers, or every cell (a blank one as "" with `keepBlanks`). */
export interface RangeReadOptions {
  numericOnly: boolean;
  keepBlanks?: boolean;
}

/** Before a range is read, the spills that could reach any of its cells: those reaching its
 *  bottom-right corner, since a table spills right and down. */
function ensureSpillsCovering(sheet: OpenSheet, coords: readonly CellCoordinates[]): void {
  const corner = coords.reduce((far, { row, col }) => ({ row: Math.max(far.row, row), col: Math.max(far.col, col) }), { row: -1, col: -1 });
  if (corner.row >= 0) sheet.ensureSpillsReaching(corner.row, corner.col);
}

/** Cells read in reading order, put back into the rows they came from. */
function rowsOfCells(coords: readonly CellCoordinates[], values: readonly CellValue[]): CellValue[][] {
  const rows = new Map<number, CellValue[]>();
  coords.forEach(({ row }, index) => {
    const cells = rows.get(row) ?? [];
    cells.push(values[index] ?? "");
    rows.set(row, cells);
  });
  return Array.from(rows.values());
}

export const isFormulaSource = (cell: unknown): boolean => isRecord(cell) && typeof cell["v"] === "string" && cell["v"].startsWith("=");

/** What reading a range needs from the sheet being calculated. */
export interface RangeReadingSources {
  resolveSheetData: (fullRef: string) => ResolvedSheetRef | null;
  /** The rows of the sheet a reference names, as written. */
  sourceSheetOf: (ref: string) => SpreadsheetCell[][] | undefined;
  evaluateValue: (formula: string) => FormulaValue;
}

/** The range reads a formula's context offers, over the sheet `sources` describes. */
export function rangeReaders({ resolveSheetData, sourceSheetOf, evaluateValue }: RangeReadingSources) {
  // The cells of a table a call answers where a range is read (`SUM(SORT(A1:A9))`), kept as a
  // range's would be: the numeric read keeps only numbers.
  const calledRangeValues = (call: string, rangeOptions: RangeReadOptions): CellValue[] => {
    const cells = cellsOf(evaluateValue(call));
    return rangeOptions.numericOnly ? cells.filter((value) => value !== "" && isRangeNumber(value)) : cells;
  };

  const collectRangeValues = (range: string, rangeOptions: RangeReadOptions): CellValue[] => {
    if (answersTable(range)) return calledRangeValues(range, rangeOptions);
    const resolved = resolveSheetData(range);
    if (!resolved) return []; // Sheet not found → empty range
    const { sheetData, ref: rangeRef, read, sheet: owner } = resolved;

    const coords = expandRangeOrCell(rangeRef);
    if (!coords) return [];
    ensureSpillsCovering(owner, coords);

    const sourceRows = sourceSheetOf(range);
    const values: CellValue[] = [];
    for (const { row, col } of coords) {
      const gridRow = row >= 0 ? sheetData[row] : undefined;
      // A position past the end of a short row, or below the last row, is a blank cell. Skipping
      // it would shorten a positional read, and every row after it would pair with the wrong one.
      const cell = gridRow && col >= 0 ? gridRow[col] : undefined;
      const rawValue = read(cell, gridRow ? { cells: gridRow, row, col } : undefined);
      // Told by the sheet as written, as isCellEmpty is: a formula cell is never blank (its `=" "`
      // included), whether it was calculated before this read or by it.
      const fromFormula = isFormulaSource(sourceRows?.[row]?.[col]);

      if (rangeOptions.numericOnly) {
        // A blank cell is not a value. Dropping it from the NUMERIC list keeps
        // SUM unchanged (a blank read as 0) while stopping it from inflating
        // AVERAGE's denominator and COUNT's tally (#2358). The raw list keeps
        // every cell so SUMIF/AVERAGEIF's criteria and value ranges stay
        // row-aligned; dropping there would shift indexes and aggregate the
        // wrong rows (Codex review).
        if (!isEmptyCell(cell) && isRangeNumber(rawValue)) {
          values.push(rawValue);
        }
      } else {
        // A calculated error has no `v`, so isEmptyCell would call it blank; it is a value.
        const isBlank = !fromFormula && isEmptyCell(cell) && !isSpreadsheetErrorValue(cell);
        values.push(rangeOptions.keepBlanks && isBlank ? "" : rawValue);
      }
    }
    return values;
  };

  // Helper to get numeric-only range values (legacy behavior)
  const getRangeValues = (range: string): CellValue[] => collectRangeValues(range, { numericOnly: true });

  // Helper to get raw range values including text
  const getRangeValuesRaw = (range: string): CellValue[] => collectRangeValues(range, { numericOnly: false });

  // Every cell, with a blank one as "" — the raw read gives a blank 0, which a
  // criteria or a pairing cannot tell from a stored 0.
  const getRangeValuesKeepingBlanks = (range: string): CellValue[] => collectRangeValues(range, { numericOnly: false, keepBlanks: true });

  // The cells of a range that hold something — a value or a formula, even one answering "" —
  // which is what COUNTA counts. It reads the cells as written: in the calculated grid a
  // formula that answered "" already looks blank.
  // A spilled cell holds a value, so it is filled too.
  const countFilledCells = (range: string): number => {
    const resolved = resolveSheetData(range);
    const coords = resolved ? expandRangeOrCell(resolved.ref) : null;
    if (!resolved || !coords) return 0;
    const source = sourceSheetOf(range);
    if (!source) return 0;
    ensureSpillsCovering(resolved.sheet, coords);
    return coords.filter(({ row, col }) => {
      const cell = source[row]?.[col];
      return (cell !== undefined && !isEmptyCell(cell)) || resolved.sheet.isSpilled(row, col);
    }).length;
  };

  /** A reference's cells row by row, a blank one as "", or the table a call answers (one value as a
   *  1×1 table). A reference to a sheet that does not exist is #REF!. */
  const getRangeGrid = (range: string): CellValue[][] => {
    if (!isSoleReference(range)) {
      const value = evaluateValue(range);
      return isCellArray(value) ? value : [[value]];
    }
    const resolved = resolveSheetData(range);
    const coords = resolved ? expandRangeOrCell(resolved.ref) : null;
    if (!coords) throw invalidRefError(range);
    return rowsOfCells(coords, collectRangeValues(range, { numericOnly: false, keepBlanks: true }));
  };

  return { getRangeValues, getRangeValuesRaw, getRangeValuesKeepingBlanks, countFilledCells, getRangeGrid };
}
