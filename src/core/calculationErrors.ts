// The formula cells of a workbook that calculate to an error, for the reply to whoever made it.
// A workbook stores formulas, not results, so an agent that wrote `=VLOOKUP(…)` has no other way to
// learn it came out #N/A — in a stress test one handed over a workbook with 82 such cells, unaware.

import { calculateWorkbook, isSpreadsheetError, normalizeData, type SheetData } from "../engine";
import { calculateWith, NO_CUSTOM_FUNCTIONS, type CustomFunctionSet } from "../engine/customFunctions";
import { indexToColumn } from "../engine/parser";
import type { SpreadsheetSheet } from "./types";

/** How many erroring cells a reply names; the rest are counted. */
export const ERROR_SAMPLES = 5;

export interface CalculationErrors {
  count: number;
  /** `Summary!B4 = #N/A (=FORECAST.LINEAR(B3,Data!H2:H37,Data!D2:D37))` */
  samples: string[];
}

const formulaOf = (cell: unknown): string | null => {
  const value = typeof cell === "object" && cell !== null && "v" in cell ? cell.v : cell;
  return typeof value === "string" && value.startsWith("=") ? value : null;
};

/** Every formula cell whose calculated value is an error code, with `functions` visible. */
export function calculationErrors(sheets: SpreadsheetSheet[], functions: CustomFunctionSet = NO_CUSTOM_FUNCTIONS): CalculationErrors {
  const engineSheets: SheetData[] = sheets.map((sheet) => ({ name: sheet.name, data: normalizeData(sheet.data) }));
  const calculated = calculateWith(functions, () => calculateWorkbook(engineSheets));
  const found = calculated.flatMap((result, index) =>
    result.data.flatMap((row, rowIndex) =>
      row.flatMap((value, colIndex) => {
        const formula = formulaOf(sheets[index]?.data[rowIndex]?.[colIndex]);
        if (formula === null || !isSpreadsheetError(value)) return [];
        return [`${sheets[index]?.name ?? ""}!${indexToColumn(colIndex)}${rowIndex + 1} = ${value} (${formula})`];
      }),
    ),
  );
  return { count: found.length, samples: found.slice(0, ERROR_SAMPLES) };
}

/** The sentence a reply carries about them, or "" when there are none. */
export function calculationErrorsNote({ count, samples }: CalculationErrors): string {
  if (count === 0) return "";
  const more = count > samples.length ? `, and ${count - samples.length} more` : "";
  return ` ${count} formula cell(s) calculate to an error — fix them before telling the user the spreadsheet is done: ${samples.join("; ")}${more}.`;
}
