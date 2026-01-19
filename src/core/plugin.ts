/**
 * Spreadsheet Plugin Core (Framework-agnostic)
 *
 * Contains the plugin logic without UI components.
 * Can be used by any framework (Vue, React, etc.)
 */

import type { ToolPluginCore, ToolContext, ToolResult } from "gui-chat-protocol";
import type { SpreadsheetToolData, SpreadsheetArgs } from "./types";
import { TOOL_DEFINITION, SYSTEM_PROMPT } from "./definition";

// Re-export for convenience
export { TOOL_NAME, TOOL_DEFINITION, SYSTEM_PROMPT } from "./definition";

// ============================================================================
// Execute Function
// ============================================================================

export const executeSpreadsheet = async (
  _context: ToolContext,
  args: SpreadsheetArgs,
): Promise<ToolResult<SpreadsheetToolData, never>> => {
  const { title } = args;
  let { sheets } = args;

  // Handle case where LLM accidentally stringifies the sheets array
  if (typeof sheets === "string") {
    try {
      sheets = JSON.parse(sheets);
      console.warn(
        "Sheets was provided as a string and has been parsed to an array",
      );
    } catch (error) {
      throw new Error(
        `Invalid sheets format: sheets must be an array, not a string. Parse error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Validate that sheets are provided
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error(
      "At least one sheet is required. Sheets must be an array of sheet objects.",
    );
  }

  // Validate each sheet has data
  for (const sheet of sheets) {
    if (!sheet.name || !sheet.data || sheet.data.length === 0) {
      throw new Error(
        `Invalid sheet: ${sheet.name || "unnamed"}. Each sheet must have a name and data array.`,
      );
    }
  }

  return {
    message: `Created spreadsheet: ${title}`,
    title,
    data: { sheets },
    instructions:
      "Acknowledge that the spreadsheet has been created and is displayed to the user.",
  };
};

// ============================================================================
// Core Plugin (without UI components)
// ============================================================================

export const pluginCore: ToolPluginCore<SpreadsheetToolData, never, SpreadsheetArgs> = {
  toolDefinition: TOOL_DEFINITION,
  execute: executeSpreadsheet,
  generatingMessage: "Creating spreadsheet...",
  waitingMessage:
    "Tell the user that the spreadsheet was created and will be presented shortly.",
  isEnabled: () => true,
  systemPrompt: SYSTEM_PROMPT,
};
