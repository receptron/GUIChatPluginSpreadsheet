/**
 * Spreadsheet Plugin - Core (Framework-agnostic)
 *
 * This module exports the core plugin logic without UI components.
 * Import from "@anthropic/guichat-plugin-spreadsheet" or "@anthropic/guichat-plugin-spreadsheet/core"
 */

// Export plugin-specific types
export type {
  SpreadsheetCell,
  SpreadsheetSheet,
  SpreadsheetToolData,
  SpreadsheetArgs,
} from "./types";

// Export plugin utilities
export {
  TOOL_NAME,
  TOOL_DEFINITION,
  SYSTEM_PROMPT,
  executeSpreadsheet,
  pluginCore,
} from "./plugin";

// Export samples
export { samples } from "./samples";
