// The workbook downloaded as an Excel file, its sheets as written (formulas included).

import * as XLSX from "xlsx";
import type { SpreadsheetSheet } from "../core/types";
import { errorMessage as formatErrorMessage } from "../engine/guards";

/** Download `sheets` as an .xlsx file named after `title` (spreadsheet.xlsx without one). */
export function downloadWorkbook(sheets: SpreadsheetSheet[], title: string | undefined): void {
  if (!sheets || sheets.length === 0) return;

  try {
    const workbook = XLSX.utils.book_new();

    // Add all sheets to workbook
    sheets.forEach((sheet) => {
      const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
    });

    // Generate filename
    const filename = title ? `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.xlsx` : "spreadsheet.xlsx";

    // Write file
    XLSX.writeFile(workbook, filename);
  } catch (error) {
    console.error("Failed to download Excel:", error);
    alert(`Failed to download Excel file: ${formatErrorMessage(error, "Unknown error")}`);
  }
}
