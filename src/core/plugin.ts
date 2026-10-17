/**
 * Spreadsheet Plugin Core (Framework-agnostic)
 *
 * Contains the plugin logic without UI components.
 * Can be used by any framework (Vue, React, etc.)
 */

import type { ToolPluginCore, ToolContext, ToolResult } from "gui-chat-protocol";
import type { SpreadsheetToolData, SpreadsheetArgs, SpreadsheetDispatchArgs, SpreadsheetSheet } from "./types";
import { TOOL_DEFINITION, SYSTEM_PROMPT } from "./definition";
import { artifactsFileOps, executeSpreadsheetDispatch, isSpreadsheetDispatchArgs } from "./dispatch";
import { spreadsheetArtifactPath } from "./paths";

// Re-export for convenience
export { TOOL_NAME, TOOL_DEFINITION, SYSTEM_PROMPT } from "./definition";

// ============================================================================
// Execute Function
// ============================================================================

function parseSheets(sheets: SpreadsheetArgs["sheets"] | string): SpreadsheetSheet[] {
  // Handle case where LLM accidentally stringifies the sheets array
  if (typeof sheets !== "string") return sheets;
  try {
    const parsed: SpreadsheetSheet[] = JSON.parse(sheets);
    console.warn("Sheets was provided as a string and has been parsed to an array");
    return parsed;
  } catch (error) {
    throw new Error(`Invalid sheets format: sheets must be an array, not a string. Parse error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateSheets(sheets: SpreadsheetSheet[]): void {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error("At least one sheet is required. Sheets must be an array of sheet objects.");
  }
  sheets.forEach((sheet) => {
    if (!sheet.name || !sheet.data || sheet.data.length === 0) {
      throw new Error(`Invalid sheet: ${sheet.name || "unnamed"}. Each sheet must have a name and data array.`);
    }
  });
}

/**
 * Create a spreadsheet. With the host's `files.artifacts`, the workbook is
 * saved and `data.sheets` carries its path; without it, the workbook itself.
 */
export const executeSpreadsheet = async (context: ToolContext, args: SpreadsheetArgs): Promise<ToolResult<SpreadsheetToolData, never>> => {
  const { title } = args;
  const sheets = parseSheets(args.sheets);
  validateSheets(sheets);

  const instructions = "Acknowledge that the spreadsheet has been created and is displayed to the user.";
  const artifacts = artifactsFileOps(context);
  if (!artifacts) {
    return { message: `Created spreadsheet: ${title}`, title, data: { sheets }, instructions };
  }
  const { relPath, filePath } = spreadsheetArtifactPath();
  await artifacts.write(relPath, JSON.stringify(sheets));
  return {
    message: `Created spreadsheet: ${title}. Saved to ${filePath}; the user can edit cells there, so read that file for the current values.`,
    title,
    data: { sheets: filePath },
    instructions,
  };
};

/** The tool call creates; the View's `dispatch` (which some hosts route to
 *  this same `execute`) loads and saves. */
async function execute(context: ToolContext, args: SpreadsheetArgs | SpreadsheetDispatchArgs): Promise<ToolResult<SpreadsheetToolData, never>> {
  if (!("kind" in args)) return executeSpreadsheet(context, args);
  const artifacts = artifactsFileOps(context);
  if (!artifacts) throw new Error("This host does not provide files.artifacts, so spreadsheets cannot be loaded or saved");
  if (!isSpreadsheetDispatchArgs(args)) throw new Error("Invalid spreadsheet dispatch");
  return executeSpreadsheetDispatch(artifacts, args);
}

// ============================================================================
// Core Plugin (without UI components)
// ============================================================================

export const pluginCore: ToolPluginCore<SpreadsheetToolData, never, SpreadsheetArgs | SpreadsheetDispatchArgs> = {
  toolDefinition: TOOL_DEFINITION,
  execute,
  generatingMessage: "Creating spreadsheet...",
  waitingMessage: "Tell the user that the spreadsheet was created and will be presented shortly.",
  isEnabled: () => true,
  systemPrompt: SYSTEM_PROMPT,
};
