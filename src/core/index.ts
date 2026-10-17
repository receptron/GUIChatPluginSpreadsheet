/**
 * Spreadsheet Plugin - Core (Framework-agnostic)
 *
 * This module exports the core plugin logic without UI components.
 * Import from "@gui-chat-plugin/spreadsheet" or "@gui-chat-plugin/spreadsheet/core"
 */

// Export plugin-specific types
export type {
  SpreadsheetCell,
  SpreadsheetCellValue,
  StorableCell,
  SpreadsheetSheet,
  SpreadsheetToolData,
  SpreadsheetArgs,
  SpreadsheetDispatchArgs,
} from "./types";

// Export plugin utilities
export {
  TOOL_NAME,
  TOOL_DEFINITION,
  SYSTEM_PROMPT,
  executeSpreadsheet,
  pluginCore,
} from "./plugin";

// Hosts that mount their own route for the View's dispatch call these directly
export { executeSpreadsheetDispatch, isSpreadsheetDispatchArgs } from "./dispatch";
export { isSpreadsheetArtifactPath } from "./paths";

// Export samples
export { samples } from "./samples";
