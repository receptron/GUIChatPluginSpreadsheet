/**
 * Spreadsheet Plugin - Vue Implementation
 *
 * Full Vue plugin with UI components.
 * Import from "@anthropic/guichat-plugin-spreadsheet/vue"
 */

// Import styles for Vue components
import "../style.css";

import type { ToolPlugin } from "gui-chat-protocol/vue";
import type { SpreadsheetToolData, SpreadsheetArgs, SpreadsheetDispatchArgs } from "../core/types";
import { pluginCore } from "../core/plugin";
import { samples } from "../core/samples";
import View from "./View.vue";
import Preview from "./Preview.vue";

// ============================================================================
// Vue Plugin (with components)
// ============================================================================

/**
 * Spreadsheet plugin instance with Vue components
 */
export const plugin: ToolPlugin<SpreadsheetToolData, never, SpreadsheetArgs | SpreadsheetDispatchArgs> = {
  ...pluginCore,
  viewComponent: View,
  previewComponent: Preview,
  samples,
};

// Re-export plugin-specific types
export type {
  SpreadsheetCell,
  SpreadsheetCellValue,
  StorableCell,
  SpreadsheetSheet,
  SpreadsheetToolData,
  SpreadsheetArgs,
  SpreadsheetDispatchArgs,
} from "../core/types";

// Re-export core plugin utilities
export { TOOL_NAME, TOOL_DEFINITION, SYSTEM_PROMPT, executeSpreadsheet, pluginCore } from "../core/plugin";

export { executeSpreadsheetDispatch, isSpreadsheetDispatchArgs } from "../core/dispatch";
export { isSpreadsheetArtifactPath } from "../core/paths";

export { samples } from "../core/samples";

// Export components for direct use
export { View, Preview };

// Default export for MulmoChat compatibility: { plugin }
export default { plugin };
