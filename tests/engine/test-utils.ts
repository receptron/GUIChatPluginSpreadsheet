/**
 * Test Utilities for Spreadsheet Engine
 *
 * Helper functions for testing with array-based output comparison
 */

import type { CellValue, SheetData, SpreadsheetCell, CalculatedSheet } from "../../src/engine/types";

/**
 * Convert calculated sheet data to string array for comparison
 *
 * @param data - Array of cell values
 * @returns 2D array of strings
 */
export function toStringArray(data: CellValue[][]): string[][] {
  return data.map((row) => row.map((cell) => String(cell ?? "")));
}

/**
 * Helper to create test sheet from simple data
 * Accepts mixed types and normalizes to SpreadsheetCell format
 *
 * @param name - Sheet name
 * @param data - Array of arrays containing cells (strings, numbers, or SpreadsheetCell objects)
 * @returns SheetData object
 */
export function createSheet(name: string, data: Array<Array<SpreadsheetCell | string | number>>): SheetData {
  return {
    name,
    data: data.map((row) =>
      row.map((cell) => {
        if (typeof cell === "object" && cell !== null && "v" in cell) {
          return cell as SpreadsheetCell;
        }
        return { v: cell };
      }),
    ),
  };
}

/**
 * Compare expected and actual output with helpful diff
 * Throws descriptive error if arrays don't match
 *
 * @param actual - Calculated sheet result
 * @param expected - Expected string array output
 */
export function expectSheetOutput(actual: CalculatedSheet, expected: string[][]): void {
  const actualStrings = toStringArray(actual.data);

  // Check dimensions first
  if (actualStrings.length !== expected.length) {
    throw new Error(`Row count mismatch: expected ${expected.length} rows, got ${actualStrings.length} rows`);
  }

  // Check each row
  actualStrings.forEach((row, i) => {
    if (row.length !== expected[i].length) {
      throw new Error(`Column count mismatch in row ${i}: expected ${expected[i].length} columns, got ${row.length} columns`);
    }

    // Check each cell
    row.forEach((cell, j) => {
      if (cell !== expected[i][j]) {
        throw new Error(`Cell mismatch at row ${i}, col ${j}: expected "${expected[i][j]}", got "${cell}"`);
      }
    });
  });
}

/**
 * Create a simple context for testing formula evaluation
 * Helper to quickly build test scenarios
 *
 * @param data - Simple 2D array of values
 * @returns Map of sheet data
 */
export function createContext(data: Array<Array<string | number>>): Map<string, SpreadsheetCell[][]> {
  const sheets = new Map<string, SpreadsheetCell[][]>();
  sheets.set(
    "Sheet1",
    data.map((row) => row.map((cell) => ({ v: cell }))),
  );
  return sheets;
}

const PV_MONTHLY_INCOME = 1000;
const PV_ANNUAL_RATE = 0.05;
const PV_MONTHS = 12;

const presentValueOfMonth = (month: number): number => PV_MONTHLY_INCOME / (1 + PV_ANNUAL_RATE / PV_MONTHS) ** month;

const formatDollars = (value: number): string => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The PV analysis sheet's column C for `month` (1-based), computed without the engine and formatted as `$#,##0.00`. */
export function expectedPvAnalysisMonth(month: number): string {
  return formatDollars(presentValueOfMonth(month));
}

/** The PV analysis sheet's B5, computed without the engine and formatted as `$#,##0.00`. */
export function expectedPvAnalysisTotal(): string {
  const total = Array.from({ length: PV_MONTHS }, (_, index) => presentValueOfMonth(index + 1)).reduce((sum, value) => sum + value, 0);
  return formatDollars(total);
}

/** The PV Analysis sheet the scripts calculate: twelve months of cash flow, each discounted. */
export const pvAnalysisData: SpreadsheetCell[][] = [
  [{ v: "Parameter" }, { v: "Value" }, { v: "" }],
  [{ v: "Monthly Income" }, { f: "$#,##0.00", v: 1000 }, { v: "Change this value" }],
  [{ v: "Annual Discount Rate" }, { f: "0.00%", v: 0.05 }, { v: "Change this value" }],
  [{ v: "Monthly Discount Rate" }, { f: "0.00%", v: "=B3/12" }, { v: "Calculated automatically" }],
  [{ v: "Total Present Value" }, { v: "=SUM(C9:C20)", f: "$#,##0.00" }, { v: "Sum of discounted cash flows" }],
  [{ v: "" }, { v: "" }, { v: "" }],
  [{ v: "" }, { v: "" }, { v: "" }],
  [{ v: "Month" }, { v: "Cash Flow" }, { v: "Present Value" }],
  [{ v: 1 }, { f: "$#,##0.00", v: "=$B$2" }, { f: "$#,##0.00", v: "=B9/(1+$B$4)^A9" }],
  [{ v: 2 }, { f: "$#,##0.00", v: "=$B$2" }, { v: "=B10/(1+$B$4)^A10", f: "$#,##0.00" }],
  [{ v: 3 }, { v: "=$B$2", f: "$#,##0.00" }, { v: "=B11/(1+$B$4)^A11", f: "$#,##0.00" }],
  [{ v: 4 }, { f: "$#,##0.00", v: "=$B$2" }, { v: "=B12/(1+$B$4)^A12", f: "$#,##0.00" }],
  [{ v: 5 }, { v: "=$B$2", f: "$#,##0.00" }, { v: "=B13/(1+$B$4)^A13", f: "$#,##0.00" }],
  [{ v: 6 }, { f: "$#,##0.00", v: "=$B$2" }, { v: "=B14/(1+$B$4)^A14", f: "$#,##0.00" }],
  [{ v: 7 }, { v: "=$B$2", f: "$#,##0.00" }, { v: "=B15/(1+$B$4)^A15", f: "$#,##0.00" }],
  [{ v: 8 }, { v: "=$B$2", f: "$#,##0.00" }, { v: "=B16/(1+$B$4)^A16", f: "$#,##0.00" }],
  [{ v: 9 }, { f: "$#,##0.00", v: "=$B$2" }, { f: "$#,##0.00", v: "=B17/(1+$B$4)^A17" }],
  [{ v: 10 }, { f: "$#,##0.00", v: "=$B$2" }, { f: "$#,##0.00", v: "=B18/(1+$B$4)^A18" }],
  [{ v: 11 }, { f: "$#,##0.00", v: "=$B$2" }, { f: "$#,##0.00", v: "=B19/(1+$B$4)^A19" }],
  [{ v: 12 }, { v: "=$B$2", f: "$#,##0.00" }, { v: "=B20/(1+$B$4)^A20", f: "$#,##0.00" }],
];
