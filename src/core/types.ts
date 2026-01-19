/**
 * Spreadsheet Plugin Types
 *
 * Plugin-specific types only.
 * Common types are imported from gui-chat-protocol.
 */

export interface SpreadsheetCell {
  v: string | number; // Value - if string starts with "=", it's a formula
  f?: string; // Format code (e.g., "$#,##0.00", "0.00%", "#,##0")
}

export interface SpreadsheetSheet {
  name: string;
  data: Array<Array<SpreadsheetCell>>;
}

export interface SpreadsheetToolData {
  sheets: SpreadsheetSheet[];
}

export interface SpreadsheetArgs {
  title: string;
  sheets: SpreadsheetSheet[];
}
