/**
 * A workbook's sheets made ready to calculate: dates written as text become serials, and where a
 * date's format comes from for display.
 */
import { type DateSource } from "./dateDisplay";
import { parseSingleCellRef } from "./formulaRefs";
import { parseDate, getDefaultDateFormat } from "./date-parser";
import type { SheetData, SpreadsheetCell } from "./types";
import { isObj } from "./guards";
import { splitSheetReference } from "./sheetReference";

/** A cell's format and formula, read off the sheets as they were given (dates already carrying
 *  the format they were typed in). A reference names its sheet, or is on `sheet`. */
export function sheetsDateSource(sheets: SheetData[]): DateSource {
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

/**
 * Pre-process sheet data to parse date strings into serial numbers
 *
 * @param data - Raw sheet data
 * @returns Processed data with dates converted to serial numbers
 */
export function preprocessDates(data: SpreadsheetCell[][], preferDDMMYYYY: boolean): SpreadsheetCell[][] {
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
