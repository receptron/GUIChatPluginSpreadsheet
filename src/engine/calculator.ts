/**
 * Spreadsheet Calculator
 *
 * Core calculation engine with circular reference detection and cross-sheet support
 */

import { formatCellForDisplay } from "./cellFormatting";
import { formulaShowsDate, type DateSource } from "./dateDisplay";
import { evaluateFormula as evaluateFormulaFn } from "./evaluator";
import { expandRangeOrCell, parseSingleCellRef } from "./formulaRefs";
import { parseDate, getDefaultDateFormat } from "./date-parser";
import type { SheetData, CellValue, CalculatedSheet, CalculationError, FormulaInfo, SpreadsheetCell, CalculateOptions } from "./types";
import { isObj, isRecord } from "./guards";
import { isBlankCell, isEmptyCell } from "./cellEmpty";
import { isRangeNumber, parseNumericString } from "./numericCoercion";
import { splitSheetReference } from "./sheetReference";
import type { CellCoordinates } from "./registry";
import { boundWholeReferences, type SheetExtent } from "./wholeReferences";
import { errorMessage } from "./guards";
import { classifyThrownError, invalidRefError } from "./formulaError";
import { isSpreadsheetErrorValue, spreadsheetError } from "./spreadsheet-errors";

// Where a cell sits in the grid of the sheet it belongs to, carrying the row so a formula's result is
// written back without re-indexing.
interface CellPosition {
  cells: any[];
  row: number;
  col: number;
}

/** Reads one cell of a sheet, calculating it if it is a formula. */
type CellReader = (cell: unknown, position?: CellPosition) => CellValue;

/** A sheet opened during one calculation: its grid, and the reader that calculates a cell of it on
 *  demand. Another sheet's formula reads it cell by cell rather than calculating it whole, so two
 *  sheets that refer to each other work as long as no CELL depends on itself (#130). */
interface OpenSheet {
  calculated: (SpreadsheetCell | CellValue)[][];
  read: CellReader;
}

/** The sheets opened so far in one calculation, by name. */
type OpenSheets = Map<string, OpenSheet>;

// The grid a reference should read from, the sheet-name-stripped ref, and the reader for that sheet.
interface ResolvedSheetRef {
  sheetData: (SpreadsheetCell | CellValue)[][];
  ref: string;
  read: CellReader;
}

/**
 * Normalize malformed data structures
 * Some models generate flat arrays instead of 2D arrays - fix them
 *
 * @param data - Potentially malformed sheet data
 * @returns Normalized 2D array
 */
/** A cell's format and formula, read off the sheets as they were given (dates already carrying
 *  the format they were typed in). A reference names its sheet, or is on `sheet`. */
function sheetsDateSource(sheets: SheetData[]): DateSource {
  return (ref, sheet) => {
    const qualified = splitSheetReference(ref);
    const target = qualified?.sheetName ?? sheet;
    const coord = parseSingleCellRef(qualified?.ref ?? ref);
    const cell = coord ? sheets.find((candidate) => candidate.name === target)?.data[coord.row]?.[coord.col] : undefined;
    if (!isObj(cell)) return null;
    const formula = typeof cell.v === "string" && cell.v.startsWith("=") ? cell.v : null;
    return { format: typeof cell.f === "string" ? cell.f : "", formula, sheet: target };
  };
}

export function normalizeData(data: any): SpreadsheetCell[][] {
  // Handle null/undefined
  if (!data) {
    return [];
  }

  // If not an array, wrap in array
  if (!Array.isArray(data)) {
    return [];
  }

  // Empty array
  if (data.length === 0) {
    return [];
  }

  // If data is already a 2D array, return as-is
  if (Array.isArray(data[0])) {
    return data as SpreadsheetCell[][];
  }

  // If data is a flat array of cell objects, convert to 2D by pairing cells
  // Pattern: [cell1, cell2, cell3, cell4] -> [[cell1, cell2], [cell3, cell4]]
  // This handles the case where models output flat arrays instead of rows
  if (isObj(data[0])) {
    const rows: SpreadsheetCell[][] = [];
    for (let i = 0; i < data.length; i += 2) {
      const row = [data[i]];
      if (i + 1 < data.length) {
        row.push(data[i + 1]);
      }
      rows.push(row);
    }
    return rows;
  }

  // Unknown structure - return empty
  console.warn("Unknown data structure in spreadsheet, returning empty:", data);
  return [];
}

/**
 * Pre-process sheet data to parse date strings into serial numbers
 *
 * @param data - Raw sheet data
 * @returns Processed data with dates converted to serial numbers
 */
function preprocessDates(data: SpreadsheetCell[][], preferDDMMYYYY: boolean): SpreadsheetCell[][] {
  return data.map((row) =>
    row.map((cell) => {
      // Skip if not a cell object or if it has a formula
      if (!isObj(cell) || !("v" in cell)) {
        return cell;
      }

      const value = cell.v;

      // Only parse strings that aren't formulas
      if (typeof value === "string" && !value.startsWith("=")) {
        const dateSerial = parseDate(value, preferDDMMYYYY);

        if (dateSerial !== null) {
          // It's a date! Convert to serial number
          return {
            v: dateSerial,
            f: cell.f || getDefaultDateFormat(value, preferDDMMYYYY), // Use existing format or detect from input
          };
        }
      }

      // Not a date, return as-is
      return cell;
    }),
  );
}

// `skipFormatting` is internal, not a public knob: a cross-sheet reference
// computes its target sheet only to READ values, so the display-formatting pass
// is skipped there — a date must stay a serial, not become "03/04/2025" that a
// downstream parseFloat reads as 3 (issue #2332).
type SheetCalculateOptions = CalculateOptions & { skipFormatting?: boolean };

const isFormulaSource = (cell: unknown): boolean => isRecord(cell) && typeof cell["v"] === "string" && cell["v"].startsWith("=");

/**
 * Calculate formulas in a single sheet
 *
 * @param sheet - Sheet data to calculate
 * @param allSheets - All sheets for cross-sheet references
 * @returns Calculated sheet with formulas evaluated
 */
export function calculateSheet(sheet: SheetData, allSheets?: SheetData[], options: SheetCalculateOptions = {}): CalculatedSheet {
  return openSheet(sheet, allSheets, options, new Map()).finish();
}

/** Open `sheet` in `opened`: everything a cell of it needs to be calculated, nothing calculated yet.
 *  `finish` walks every cell and formats it — what calculating the sheet itself means; a sheet opened
 *  only because another one reads it is never finished, just read. */
function openSheet(
  sheet: SheetData,
  allSheets: SheetData[] | undefined,
  options: SheetCalculateOptions,
  opened: OpenSheets,
): { finish: () => CalculatedSheet } {
  const preferDDMMYYYY = options.preferDDMMYYYY ?? false;
  const skipFormatting = options.skipFormatting ?? false;
  // Normalize malformed data structures first
  const normalizedData = normalizeData(sheet.data);

  // Pre-process dates before calculation
  const processedData = preprocessDates(normalizedData, preferDDMMYYYY);

  // Also preprocess all sheets if provided
  const processedAllSheets = allSheets?.map((s) => ({
    ...s,
    data: preprocessDates(normalizeData(s.data), preferDDMMYYYY),
  }));

  const data = processedData;
  const sheetName = sheet.name;
  const errors: CalculationError[] = [];
  const formulas: FormulaInfo[] = [];

  // Create a copy of the data with calculated values
  const calculated: any[][] = data.map((row) => [...row]);

  // Track cells being calculated to detect circular references
  const calculating = new Set<string>();
  // Cells whose result is already stored in `calculated`, of ANY type. A number
  // check alone missed string/error results, so a cell referenced before the
  // top loop reached it was re-evaluated (and, once formulas can throw, would
  // re-emit its error). Membership here means "read the cached value, do not
  // re-run".
  const evaluated = new Set<string>();
  // The formula cells being calculated, innermost last: a formula reading another cell calculates
  // it in between, so `ROW()` answers for whichever is on top.
  const cellsBeingCalculated: CellCoordinates[] = [];

  // How far a sheet's data reaches, for bounding `A:A` and `1:1`; null for a sheet that does not exist.
  const extentOf = (name: string | null): SheetExtent | null => {
    const rows = name === null || name === sheetName ? data : processedAllSheets?.find((other) => other.name === name)?.data;
    return rows ? { rows: rows.length, columns: rows.reduce((longest, row) => Math.max(longest, row.length), 0) } : null;
  };

  // Evaluate one formula cell, guarding circular references, caching the result,
  // and turning a thrown failure into a typed errors[] entry plus the Excel
  // error value in the cell — never a swallowed bare string/number (#2359).
  const resolveFormulaCell = (formulaText: string, { cells, row, col }: CellPosition): CellValue => {
    const cellKey = `${row},${col}`;
    if (calculating.has(cellKey)) {
      errors.push({ cell: { row, col }, formula: formulaText, error: "Circular reference detected", type: "circular" });
      return 0;
    }
    if (evaluated.has(cellKey)) return cells[col];
    calculating.add(cellKey);
    cellsBeingCalculated.push({ row, col });
    try {
      const result = evaluateFormula(boundWholeReferences(formulaText.substring(1), extentOf)); // drop leading "="
      cells[col] = result;
      return result;
    } catch (error) {
      const { type, display } = classifyThrownError(error);
      errors.push({ cell: { row, col }, formula: formulaText, error: errorMessage(error), type });
      // The error VALUE, not its text: a cell that reads this one must see a
      // real error, and the display pass renders it back to `#DIV/0!`.
      const errorValue = spreadsheetError(display);
      cells[col] = errorValue;
      return errorValue;
    } finally {
      cellsBeingCalculated.pop();
      calculating.delete(cellKey);
      evaluated.add(cellKey);
    }
  };

  const isCalculatedFormula = ({ row, col }: CellPosition): boolean => evaluated.has(`${row},${col}`) && isFormulaSource(data[row]?.[col]);

  // Helper to extract raw value from cell with recursive formula evaluation
  const getRawValue = (cell: any, position?: CellPosition): CellValue => {
    // A formula already calculated holds its answer, which reads as it was answered: its "" stays
    // "" and its text "1,200" stays text, as they read before it was calculated.
    if (position && isCalculatedFormula(position)) return cell;

    // Handle null/undefined cells - treat as 0
    if (cell === null || cell === undefined) return 0;

    // An already-calculated cell can hold a formula error; it stays an error.
    if (isSpreadsheetErrorValue(cell)) return cell;

    if (typeof cell === "number") return cell;

    // Text that is a number as typed ("1,200", "25%", "$1,000") reads as that number; any other text
    // stays text — "2023-01" is not 2023, and "Tokyo, Japan" is not 0. An empty string is 0.
    if (typeof cell === "string") {
      if (cell.trim() === "") return 0;
      return parseNumericString(cell) ?? cell;
    }

    // Handle new cell format {v, f}; a cell without `v` holds nothing.
    if (isObj(cell)) {
      const value = "v" in cell ? cell.v : undefined;
      // If value is a string starting with "=", it's a formula
      if (typeof value === "string" && value.startsWith("=")) {
        // Only evaluatable when we know the cell's position (for recursion +
        // circular tracking); otherwise treat as 0.
        return position ? resolveFormulaCell(value, position) : 0;
      }
      // The walk copies a plain `v` into the grid as it is, so it is read by the same rules here: a
      // cell the formula reaches before the walk does reads as it will after ("5%" as 0.05, null as 0).
      return getRawValue(value);
    }

    // Try to parse cell as number, but preserve strings
    const num = parseFloat(cell);
    return isNaN(num) ? cell : num;
  };

  // Resolve a possibly cross-sheet reference to the grid it reads from. Another sheet is opened in
  // the same calculation (once) and read cell by cell; null means the named sheet does not exist — the
  // caller picks the terminal action (#REF! for a single cell, [] for a range). Values read across
  // sheets are RAW: an opened sheet is never formatted, so a date reads as its serial, not "03/04/2025".
  const resolveSheetData = (fullRef: string): ResolvedSheetRef | null => {
    const qualified = splitSheetReference(fullRef);
    if (!qualified) return { sheetData: calculated, ref: fullRef, read: getRawValue };
    const target = opened.get(qualified.sheetName) ?? openOther(qualified.sheetName);
    return target ? { sheetData: target.calculated, ref: qualified.ref, read: target.read } : null;
  };

  const openOther = (name: string): OpenSheet | null => {
    const targetSheet = processedAllSheets?.find((s) => s.name === name);
    if (!targetSheet || !targetSheet.data) return null;
    openSheet(targetSheet, processedAllSheets, { preferDDMMYYYY, skipFormatting: true }, opened);
    return opened.get(name) ?? null;
  };

  /** The grid cell a reference names, with its position and its sheet's reader; null outside the grid. */
  const locateCell = (ref: string): { cell: unknown; position: CellPosition; read: CellReader } | null => {
    const resolved = resolveSheetData(ref);
    if (!resolved) throw invalidRefError(ref); // Sheet not found → #REF!
    const { sheetData, ref: cellRef, read } = resolved;

    // `$` symbols and the A1 shape are parsed by the shared single-cell reader.
    const coord = parseSingleCellRef(cellRef);
    if (!coord) return null;

    const { row, col } = coord;
    const gridRow = row >= 0 ? sheetData[row] : undefined;
    if (!gridRow || col < 0 || col >= gridRow.length) return null;

    return { cell: gridRow[col], position: { cells: gridRow, row, col }, read };
  };

  // Helper to get cell value by reference (e.g., "B2", "$B$2", or "'Sheet1'!B2")
  const getCellValue = (ref: string): CellValue => {
    const located = locateCell(ref);
    return located ? located.read(located.cell, located.position) : 0;
  };

  /** Whether a reference names a cell that holds nothing — outside the grid included. A formula
   *  cell is never empty, whatever it answers (`=""` and `=" "` included), as in Excel; it is told
   *  by the sheet as written, which no calculation changes, so the answer does not depend on order. */
  const isCellEmpty = (ref: string): boolean => {
    const located = locateCell(ref);
    if (located === null) return true;
    if (isFormulaSource(sourceSheetOf(ref)?.[located.position.row]?.[located.position.col])) return false;
    return isBlankCell(located.cell);
  };

  /** The rows of the sheet a reference names, as written. */
  const sourceSheetOf = (ref: string): SpreadsheetCell[][] | undefined => {
    const name = splitSheetReference(ref)?.sheetName ?? sheetName;
    return name === sheetName ? data : processedAllSheets?.find((other) => other.name === name)?.data;
  };

  const collectRangeValues = (range: string, rangeOptions: { numericOnly: boolean; keepBlanks?: boolean }): CellValue[] => {
    const resolved = resolveSheetData(range);
    if (!resolved) return []; // Sheet not found → empty range
    const { sheetData, ref: rangeRef, read } = resolved;

    const coords = expandRangeOrCell(rangeRef);
    if (!coords) return [];

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
  const countFilledCells = (range: string): number => {
    const resolved = resolveSheetData(range);
    const coords = resolved ? expandRangeOrCell(resolved.ref) : null;
    if (!resolved || !coords) return 0;
    const sourceName = splitSheetReference(range)?.sheetName ?? sheetName;
    const source = sourceName === sheetName ? data : processedAllSheets?.find((s) => s.name === sourceName)?.data;
    if (!source) return 0;
    return coords.filter(({ row, col }) => {
      const cell = source[row]?.[col];
      return cell !== undefined && !isEmptyCell(cell);
    }).length;
  };

  // Evaluate a formula with context
  const evaluateFormula = (formula: string): CellValue => {
    return evaluateFormulaFn(formula, {
      getCellValue,
      getRangeValues,
      getRangeValuesRaw,
      getRangeValuesKeepingBlanks,
      countFilledCells,
      evaluateFormula,
      preferDDMMYYYY,
      isCellEmpty,
      currentCell: cellsBeingCalculated.at(-1),
    });
  };

  // Compute one cell into its calculated row. A cell not in {v, f} format is
  // left as-is (it is already a plain value).
  const calculateCell = (originalCell: SpreadsheetCell, position: CellPosition): void => {
    if (!isObj(originalCell) || !("v" in originalCell)) return;
    const value = originalCell.v;

    // A plain value is copied through, so range evaluation reads it.
    if (typeof value !== "string" || !value.startsWith("=")) {
      position.cells[position.col] = value;
      return;
    }

    const info: FormulaInfo = {
      cell: { row: position.row, col: position.col },
      formula: value,
      dependencies: [], // TODO: Extract dependencies from formula
      result: 0, // Will be updated below
    };
    formulas.push(info);
    // Route through the protected path so a thrown failure is classified into
    // errors[] instead of escaping this walk, and a cell already resolved via
    // another formula's recursion is read from cache (#2359).
    info.result = resolveFormulaCell(value, position);
    // Store result as-is (formatting will be applied at the end)
    position.cells[position.col] = info.result;
  };

  // Walk every cell of the grid. `calculated` is built as a row-for-row copy of
  // `data` and never resized, so a missing row cannot happen; skipping one keeps
  // the walk total rather than asserting the invariant at each cell.
  const forEachCell = (visit: (originalCell: SpreadsheetCell, position: CellPosition) => void): void => {
    data.forEach((dataRow, row) => {
      const cells = calculated[row];
      if (!cells) return;
      dataRow.forEach((originalCell, col) => visit(originalCell, { cells, row, col }));
    });
  };

  // Opened before anything is calculated, so a sheet that reads this one back finds it here.
  opened.set(sheetName, { calculated, read: getRawValue });

  const finish = (): CalculatedSheet => {
    // Process all cells and calculate formulas; formatting comes at the end. A formula already
    // evaluated — through another formula, on this sheet or from another — is read back from its
    // cell by resolveFormulaCell, not run again, and is still listed in `formulas`.
    forEachCell(calculateCell);

    // Final display-formatting pass: turn raw serials into presentation strings.
    // Skipped when this sheet is computed only to resolve a cross-sheet reference,
    // so the referencing cell reads the underlying value, not a display string.
    if (!skipFormatting) {
      const dateSource = sheetsDateSource([{ name: sheetName, data }, ...(processedAllSheets ?? []).filter((other) => other.name !== sheetName)]);
      forEachCell((originalCell, { cells, col }) => {
        const source = isObj(originalCell) && typeof originalCell.v === "string" ? originalCell.v : "";
        const showsDate = source.startsWith("=") && formulaShowsDate(source, sheetName, dateSource);
        cells[col] = formatCellForDisplay(originalCell, cells[col], preferDDMMYYYY, showsDate);
      });
    }

    return {
      name: sheetName,
      data: calculated,
      formulas,
      errors,
    };
  };
  return { finish };
}

/**
 * Calculate all sheets in a workbook
 *
 * @param sheets - Array of sheets to calculate
 * @returns Array of calculated sheets
 */
export function calculateWorkbook(sheets: SheetData[], options: CalculateOptions = {}): CalculatedSheet[] {
  return sheets.map((sheet) => calculateSheet(sheet, sheets, options));
}
