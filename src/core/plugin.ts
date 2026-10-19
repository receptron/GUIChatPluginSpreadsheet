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
import { loadCustomFunctions } from "../engine/customFunctions";
import { calculationErrors, calculationErrorsNote, ERROR_SAMPLES } from "./calculationErrors";

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
    throw new Error(`Invalid sheets format: sheets must be an array, not a string. Parse error: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
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

/** What the agent is told about the workbook it made, so it can fix it before the user sees it:
 *  functions it defined that cannot be used (their calls show #NAME?), and formula cells that
 *  calculate to an error. The workbook holds formulas, not results, so there is no other way to know. */
async function workbookNotes(sheets: SpreadsheetSheet[]): Promise<string> {
  const functions = await loadCustomFunctions(sheets);
  try {
    const problems =
      functions.problems.length === 0
        ? ""
        : ` These functions could not be used and calls to them show #NAME?: ${functions.problems
            .slice(0, ERROR_SAMPLES)
            .map(({ name, reason }) => `${name} (${reason})`)
            .join("; ")}.`;
    return problems + calculationErrorsNote(calculationErrors(sheets, functions));
  } finally {
    functions.dispose();
  }
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
  const functionNote = await workbookNotes(sheets);
  const artifacts = artifactsFileOps(context);
  if (!artifacts) {
    return { message: `Created spreadsheet: ${title}${functionNote}`, title, data: { sheets }, instructions };
  }
  const { relPath, filePath } = spreadsheetArtifactPath();
  await artifacts.write(relPath, JSON.stringify(sheets));
  return {
    message: `Created spreadsheet: ${title}. Saved to ${filePath}; the user can edit cells there, so read that file for the current values.${functionNote}`,
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
