/**
 * Spreadsheet Plugin Types
 *
 * Plugin-specific types only.
 * Common types are imported from gui-chat-protocol.
 */

/** Mirrors the engine's `StoredCellValue`. */
export type SpreadsheetCellValue = string | number | boolean;

export interface SpreadsheetCell {
  v: SpreadsheetCellValue; // Value - if string starts with "=", it's a formula
  f?: string; // Format code (e.g., "$#,##0.00", "0.00%", "#,##0")
}

/** A cell as a stored workbook actually holds it. The engine's `normalizeData`
 *  folds all four forms, and models and hand edits write all four, so a
 *  workbook read back off disk cannot promise `{ v }` for every cell. The tool
 *  SCHEMA is deliberately stricter — it says what a caller should emit, not
 *  what an existing file may contain. */
export type StorableCell = SpreadsheetCell | { v?: null; f?: string } | SpreadsheetCellValue | null;

export interface SpreadsheetSheet {
  name: string;
  data: StorableCell[][];
}

/** `sheets` is the workbook itself, or — when the host gave the plugin
 *  `files.artifacts` — the workspace-relative path it was saved to. */
export interface SpreadsheetToolData {
  sheets: SpreadsheetSheet[] | string;
}

export interface SpreadsheetArgs {
  title: string;
  sheets: SpreadsheetSheet[];
}

/** What the View sends through `useRuntime().dispatch`. A save with `baseVersion` is written
 *  only while the file still holds that version, so it cannot overwrite a change made since. */
export type SpreadsheetDispatchArgs =
  { kind: "loadSpreadsheet"; path: string } | { kind: "saveSpreadsheet"; path: string; sheets: SpreadsheetSheet[]; baseVersion?: string };

/** What a load or save dispatch answers. `version` names the file's content as the answer
 *  leaves it. With `conflict`, the save was not written: the file had changed since
 *  `baseVersion`, and `sheets` is the file as it is now. */
export interface SpreadsheetFileData {
  sheets: SpreadsheetSheet[] | string;
  version: string;
  conflict?: true;
}
