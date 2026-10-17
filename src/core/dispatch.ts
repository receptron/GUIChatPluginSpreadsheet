// Server-side half of the View's `useRuntime().dispatch({ kind, … })`: read a
// saved workbook back, or overwrite it with the user's edits. Both go through
// the host's generic `files.artifacts`, so no host needs a spreadsheet route.

import type { FileOps, ToolResult } from "gui-chat-protocol";
import { isRecord } from "../engine/guards";
import { isSpreadsheetArtifactPath, toArtifactsRelative } from "./paths";
import { isSheet, readSheets } from "./sheetGuards";
import type { SpreadsheetDispatchArgs, SpreadsheetToolData } from "./types";

export function isSpreadsheetDispatchArgs(value: unknown): value is SpreadsheetDispatchArgs {
  if (!isRecord(value) || typeof value["path"] !== "string") return false;
  if (value["kind"] === "loadSpreadsheet") return true;
  return value["kind"] === "saveSpreadsheet" && Array.isArray(value["sheets"]) && value["sheets"].every(isSheet);
}

const isFileOps = (value: unknown): value is FileOps => isRecord(value) && typeof value["read"] === "function" && typeof value["write"] === "function";

/** `files.artifacts` off a host context, when the host provides it. The
 *  protocol's `ToolContext` does not declare `files`, so it is checked rather
 *  than assumed. */
export function artifactsFileOps(context: unknown): FileOps | null {
  if (!isRecord(context) || !isRecord(context["files"])) return null;
  const artifacts = context["files"]["artifacts"];
  return isFileOps(artifacts) ? artifacts : null;
}

async function loadSheets(artifacts: FileOps, path: string): Promise<ToolResult<SpreadsheetToolData, never>> {
  const raw = await artifacts.read(toArtifactsRelative(path));
  const sheets = readSheets(JSON.parse(raw));
  if (!sheets) throw new Error(`${path} does not hold an array of sheets`);
  return { message: `Loaded spreadsheet ${path}`, data: { sheets } };
}

export async function executeSpreadsheetDispatch(artifacts: FileOps, args: SpreadsheetDispatchArgs): Promise<ToolResult<SpreadsheetToolData, never>> {
  if (!isSpreadsheetArtifactPath(args.path)) {
    throw new Error("path must be a .json file under artifacts/spreadsheets/");
  }
  if (args.kind === "loadSpreadsheet") return loadSheets(artifacts, args.path);
  await artifacts.write(toArtifactsRelative(args.path), JSON.stringify(args.sheets));
  return { message: `Saved spreadsheet ${args.path}`, data: { sheets: args.path } };
}
