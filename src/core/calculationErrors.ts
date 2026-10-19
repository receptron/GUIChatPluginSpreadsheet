// The formula cells of a workbook that calculate to an error, for the reply to whoever made it.
// A workbook stores formulas, not results, so an agent that wrote `=VLOOKUP(…)` has no other way to
// learn it came out #N/A — in a stress test one handed over a workbook with 82 such cells, unaware.

import { calculateSheet, isSpreadsheetErrorValue, normalizeData, type SheetData } from "../engine";
import { calculateWith, NO_CUSTOM_FUNCTIONS, type CustomFunctionSet } from "../engine/customFunctions";
import { indexToColumn } from "../engine/parser";
import type { SpreadsheetSheet } from "./types";

/** How many erroring cells a reply names; the rest are counted. */
export const ERROR_SAMPLES = 5;
/** A formula is quoted up to this many characters, so the reply stays short whatever was written. */
export const FORMULA_QUOTE_LIMIT = 80;

const quoted = (formula: string): string => (formula.length > FORMULA_QUOTE_LIMIT ? `${formula.slice(0, FORMULA_QUOTE_LIMIT)}…` : formula);

export interface CalculationErrors {
  count: number;
  /** `Summary!B4 = #N/A (=FORECAST.LINEAR(B3,Data!H2:H37,Data!D2:D37))` */
  samples: string[];
}

const formulaOf = (cell: unknown): string | null => {
  const value = typeof cell === "object" && cell !== null && "v" in cell ? cell.v : cell;
  return typeof value === "string" && value.startsWith("=") ? value : null;
};

/** Every formula cell whose calculated value is an error, with `functions` visible. Read from the
 *  calculation before display formatting, where an error is an error VALUE: a formula that returns
 *  the text "#N/A" is not one. */
export function calculationErrors(sheets: SpreadsheetSheet[], functions: CustomFunctionSet = NO_CUSTOM_FUNCTIONS): CalculationErrors {
  const engineSheets: SheetData[] = sheets.map((sheet) => ({ name: sheet.name, data: normalizeData(sheet.data) }));
  const calculated = calculateWith(functions, () => engineSheets.map((sheet) => calculateSheet(sheet, engineSheets, { skipFormatting: true })));
  const found = calculated.flatMap((result, index) =>
    result.data.flatMap((row, rowIndex) =>
      row.flatMap((value: unknown, colIndex) => {
        const formula = formulaOf(sheets[index]?.data[rowIndex]?.[colIndex]);
        if (formula === null || !isSpreadsheetErrorValue(value)) return [];
        return [`${sheets[index]?.name ?? ""}!${indexToColumn(colIndex)}${rowIndex + 1} = ${value.code} (${quoted(formula)})`];
      }),
    ),
  );
  return { count: found.length, samples: found.slice(0, ERROR_SAMPLES) };
}

/** The sentence a reply carries about them, or "" when there are none. */
export function calculationErrorsNote({ count, samples }: CalculationErrors): string {
  if (count === 0) return "";
  const more = count > samples.length ? `, and ${count - samples.length} more` : "";
  return ` ${count} formula cell(s) calculate to an error; fix any that are not meant to be errors before telling the user the spreadsheet is ready: ${samples.join("; ")}${more}.`;
}
