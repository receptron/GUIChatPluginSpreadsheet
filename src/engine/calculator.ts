/**
 * Spreadsheet Calculator
 *
 * Core calculation engine with circular reference detection and cross-sheet support
 */

import { formatCellForDisplay } from "./cellFormatting";
import { formulaShowsDate, type DateSource } from "./dateDisplay";
import { evaluateFormula as evaluateFormulaFn } from "./evaluator";
import { parseSingleCellRef } from "./formulaRefs";
import type { SheetData, CellValue, CalculatedSheet, CalculationError, FormulaInfo, SpreadsheetCell, CalculateOptions, FormulaValue } from "./types";
import { isCellArray, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, scalarOf } from "./cellArray";
import { arrayOperands } from "./arrayExpression";
import { spillTargets } from "./spillTargets";
import { isObj, isRecord } from "./guards";
import { isBlankCell, isEmptyCell } from "./cellEmpty";
import { parseNumericString } from "./numericCoercion";
import { splitSheetReference } from "./sheetReference";
import { CALL_NAMES, type CellCoordinates } from "./registry";
import { boundWholeReferences, type ExtentReach, type SheetExtent } from "./wholeReferences";
import { errorMessage } from "./guards";
import { classifyThrownError, invalidRefError } from "./formulaError";
import { isSpreadsheetErrorValue, SPILL_ERROR, spreadsheetError } from "./spreadsheet-errors";
import type { CellPosition, CellReader, OpenSheet, OpenSheets, ResolvedSheetRef } from "./openSheetTypes";
import { preprocessDates, sheetsDateSource } from "./sheetPreparation";
import { isFormulaSource, rangeReaders } from "./rangeReading";

/**
 * Normalize malformed data structures
 * Some models generate flat arrays instead of 2D arrays - fix them
 *
 * @param data - Potentially malformed sheet data
 * @returns Normalized 2D array
 */
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

// `skipFormatting` is internal, not a public knob: a cross-sheet reference
// computes its target sheet only to READ values, so the display-formatting pass
// is skipped there — a date must stay a serial, not become "03/04/2025" that a
// downstream parseFloat reads as 3 (issue #2332).
type SheetCalculateOptions = CalculateOptions & { skipFormatting?: boolean };

/** A cell a table spilled into, and the formula cell it spilled from. */
interface SpilledCell {
  row: number;
  col: number;
  anchor: CellCoordinates;
}

const formatCodeAt = (cell: unknown): string => (isRecord(cell) && typeof cell["f"] === "string" ? cell["f"] : "");

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

  // How far a sheet reaches, for bounding `A:A` and `1:1`; null for a sheet that does not exist.
  const extentOf = (name: string | null, reach?: ExtentReach): SheetExtent | null => {
    const named = name === null || name === sheetName ? self : (opened.get(name) ?? openOther(name));
    return named ? named.extent(reach) : null;
  };

  const formulaAt = (row: number, col: number): string | null => {
    const cell = data[row]?.[col];
    const value = isObj(cell) ? cell.v : undefined;
    return typeof value === "string" && value.startsWith("=") ? value : null;
  };
  // The formula cells that may answer a table, in reading order, decided from their text alone.
  const spillCandidates: CellCoordinates[] = data.flatMap((dataRow, row) =>
    dataRow.flatMap((_, col) => {
      const formula = formulaAt(row, col);
      return formula !== null && arrayOperands(formula.substring(1), CALL_NAMES).length > 0 ? [{ row, col }] : [];
    }),
  );
  // Each spilled cell, by its key, with the cell it spilled from.
  const spilledCells = new Map<string, SpilledCell>();

  // A cell of the calculated grid, the grid grown to hold it when a table spills past the data.
  const writeCalculated = (row: number, col: number, value: CellValue): void => {
    while (calculated.length <= row) calculated.push([]);
    const cells = calculated[row];
    if (!cells) return;
    while (cells.length < col) cells.push("");
    cells[col] = value;
  };

  // Something written in the sheet (a value, a formula, one answering "" included) or a table
  // already spilled there keeps a table out.
  const isSpillTargetTaken = (row: number, col: number): boolean => !isEmptyCell(data[row]?.[col]) || spilledCells.has(`${row},${col}`);

  /** A candidate's answer placed in the grid: a table spills and its top-left cell is the anchor's
   *  value, or the anchor is #SPILL! when a cell it needs is taken. */
  const placeResult = (value: FormulaValue, anchor: CellCoordinates, formulaText: string): CellValue => {
    if (!isCellArray(value)) return value;
    const width = value.reduce((widest, row) => Math.max(widest, row.length), 0);
    if (anchor.row + value.length > MAX_TABLE_ROWS || anchor.col + width > MAX_TABLE_COLUMNS) {
      errors.push({ cell: anchor, formula: formulaText, error: "Spill range goes past the edge of the sheet", type: "unknown" });
      return SPILL_ERROR;
    }
    const targets = spillTargets(anchor, value);
    if (targets.some(({ row, col }) => isSpillTargetTaken(row, col))) {
      errors.push({ cell: anchor, formula: formulaText, error: "Spill range is not blank", type: "unknown" });
      return SPILL_ERROR;
    }
    targets.forEach(({ row, col, value: cellValue }) => {
      writeCalculated(row, col, cellValue);
      spilledCells.set(`${row},${col}`, { row, col, anchor });
    });
    return value[0]?.[0] ?? SPILL_ERROR;
  };

  // A table spills right and down, so only a candidate above and to the left can reach a cell. One
  // being calculated is skipped: it is what is reading, and cannot have spilled yet.
  // The candidates not calculated yet, which shrinks to nothing, so a read stops scanning once
  // every table has spilled.
  const pending = { candidates: spillCandidates };
  const ensureSpillsReaching = (row: number, col: number): void => {
    if (pending.candidates.length === 0) return;
    pending.candidates.forEach((candidate) => {
      const key = `${candidate.row},${candidate.col}`;
      if (candidate.row > row || candidate.col > col || evaluated.has(key) || calculating.has(key)) return;
      const cells = calculated[candidate.row];
      const formula = formulaAt(candidate.row, candidate.col);
      if (cells && formula) resolveFormulaCell(formula, { cells, row: candidate.row, col: candidate.col });
    });
    pending.candidates = pending.candidates.filter(({ row: candidateRow, col: candidateCol }) => !evaluated.has(`${candidateRow},${candidateCol}`));
  };

  const sheetExtent = (reach: ExtentReach = {}): SheetExtent => {
    ensureSpillsReaching(reach.lastRow ?? Infinity, reach.lastColumn ?? Infinity);
    return { rows: calculated.length, columns: calculated.reduce((longest, row) => Math.max(longest, row.length), 0) };
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
      const value = evaluateValue(boundWholeReferences(formulaText.substring(1), extentOf)); // drop leading "="
      const result = placeResult(value, { row, col }, formulaText);
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
    if (!qualified) return { sheetData: calculated, ref: fullRef, read: getRawValue, sheet: self };
    const target = opened.get(qualified.sheetName) ?? openOther(qualified.sheetName);
    return target ? { sheetData: target.calculated, ref: qualified.ref, read: target.read, sheet: target } : null;
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
    const { sheetData, ref: cellRef, read, sheet: owner } = resolved;

    // `$` symbols and the A1 shape are parsed by the shared single-cell reader.
    const coord = parseSingleCellRef(cellRef);
    if (!coord) return null;

    const { row, col } = coord;
    owner.ensureSpillsReaching(row, col);
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

  const { getRangeValues, getRangeValuesRaw, getRangeValuesKeepingBlanks, countFilledCells, getRangeGrid } = rangeReaders({
    resolveSheetData,
    sourceSheetOf,
    evaluateValue: (formula) => evaluateValue(formula),
  });

  // Evaluate a formula with context: its value, a table included, and where one value is needed,
  // the one a table stands for (scalarOf).
  const evaluateValue = (formula: string): FormulaValue =>
    evaluateFormulaFn(formula, {
      getCellValue,
      getRangeValues,
      getRangeValuesRaw,
      getRangeValuesKeepingBlanks,
      countFilledCells,
      evaluateFormula,
      evaluateValue,
      getRangeGrid,
      preferDDMMYYYY,
      isCellEmpty,
      currentCell: cellsBeingCalculated.at(-1),
      currentSheet: sheetName,
    });
  const evaluateFormula = (formula: string): CellValue => scalarOf(evaluateValue(formula));

  // Compute one cell into its calculated row. A cell not in {v, f} format is
  // left as-is (it is already a plain value).
  const calculateCell = (originalCell: SpreadsheetCell, position: CellPosition): void => {
    // A blank cell a table spilled into holds the spilled value, which copying the cell would erase.
    if (spilledCells.has(`${position.row},${position.col}`)) return;
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
      dependencies: [], // not tracked: recalculation follows references as it reads them
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

  /** A spilled cell is shown as its anchor's formula would show it there: in the cell's own format
   *  where the sheet gives it one, else the anchor's, and as a date when the anchor's formula is one. */
  const formatSpilledCell = ({ row, col, anchor }: SpilledCell, dateSource: DateSource): void => {
    const cells = calculated[row];
    if (!cells) return;
    const formula = formulaAt(anchor.row, anchor.col) ?? "";
    const format = formatCodeAt(data[row]?.[col]) || formatCodeAt(data[anchor.row]?.[anchor.col]);
    const showsDate = formulaShowsDate(formula, sheetName, dateSource);
    cells[col] = formatCellForDisplay({ v: formula, f: format }, cells[col], preferDDMMYYYY, showsDate);
  };

  const self: OpenSheet = {
    calculated,
    read: getRawValue,
    ensureSpillsReaching,
    isSpilled: (row, col) => spilledCells.has(`${row},${col}`),
    extent: sheetExtent,
  };
  // Opened before anything is calculated, so a sheet that reads this one back finds it here.
  opened.set(sheetName, self);

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
      spilledCells.forEach((spilled) => formatSpilledCell(spilled, dateSource));
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
