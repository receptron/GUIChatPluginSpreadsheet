// Server-side half of the View's `useRuntime().dispatch({ kind, … })`: read a
// saved workbook back, or write the user's edits over it — only while the file is
// still the version the View read. Both go through the host's generic
// `files.artifacts`, so no host needs a spreadsheet route.

import { createSerialLock, type FileOps, type SerialLock, type ToolResult } from "gui-chat-protocol";
import { isRecord } from "../engine/guards";
import { isSpreadsheetArtifactPath, toArtifactsRelative } from "./paths";
import { isSheet, readSheets } from "./sheetGuards";
import { contentVersion, isStaleBase } from "./contentVersion";
import type { SpreadsheetDispatchArgs, SpreadsheetFileData, SpreadsheetSheet } from "./types";

export function isSpreadsheetDispatchArgs(value: unknown): value is SpreadsheetDispatchArgs {
  if (!isRecord(value) || typeof value["path"] !== "string") return false;
  if (value["kind"] === "loadSpreadsheet") return true;
  const baseVersion = value["baseVersion"];
  return (
    value["kind"] === "saveSpreadsheet" &&
    Array.isArray(value["sheets"]) &&
    value["sheets"].every(isSheet) &&
    (baseVersion === undefined || typeof baseVersion === "string")
  );
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

function parseSheetsText(raw: string, path: string): SpreadsheetSheet[] {
  const sheets = readSheets(JSON.parse(raw));
  if (!sheets) throw new Error(`${path} does not hold an array of sheets`);
  return sheets;
}

async function loadSheets(artifacts: FileOps, path: string): Promise<ToolResult<SpreadsheetFileData, never>> {
  const raw = await artifacts.read(toArtifactsRelative(path));
  return { message: `Loaded spreadsheet ${path}`, data: { sheets: parseSheetsText(raw, path), version: await contentVersion(raw) } };
}

// One lock per file: a save reads the file, compares and writes, and a second save
// of the same file must not read between the first one's read and its write.
const fileLocks = new Map<string, SerialLock>();

function lockFor(relPath: string): SerialLock {
  const existing = fileLocks.get(relPath);
  if (existing) return existing;
  const lock = createSerialLock();
  fileLocks.set(relPath, lock);
  return lock;
}

/** The file's text now, or null when there is no file. */
async function currentText(artifacts: FileOps, relPath: string): Promise<string | null> {
  return (await artifacts.exists(relPath)) ? artifacts.read(relPath) : null;
}

function conflictResult(path: string, current: string, version: string): ToolResult<SpreadsheetFileData, never> {
  return {
    message: `Did not save spreadsheet ${path}: it changed since it was read`,
    data: { sheets: parseSheetsText(current, path), version, conflict: true },
  };
}

async function saveSheets(
  artifacts: FileOps,
  path: string,
  sheets: SpreadsheetSheet[],
  baseVersion: string | undefined,
): Promise<ToolResult<SpreadsheetFileData, never>> {
  const relPath = toArtifactsRelative(path);
  return lockFor(relPath)(async () => {
    const current = baseVersion === undefined ? null : await currentText(artifacts, relPath);
    const currentVersion = current === null ? null : await contentVersion(current);
    if (current !== null && currentVersion !== null && isStaleBase(baseVersion, currentVersion)) return conflictResult(path, current, currentVersion);
    const text = JSON.stringify(sheets);
    await artifacts.write(relPath, text);
    return { message: `Saved spreadsheet ${path}`, data: { sheets: path, version: await contentVersion(text) } };
  });
}

export async function executeSpreadsheetDispatch(artifacts: FileOps, args: SpreadsheetDispatchArgs): Promise<ToolResult<SpreadsheetFileData, never>> {
  if (!isSpreadsheetArtifactPath(args.path)) {
    throw new Error("path must be a .json file under artifacts/spreadsheets/");
  }
  if (args.kind === "loadSpreadsheet") return loadSheets(artifacts, args.path);
  return saveSheets(artifacts, args.path, args.sheets, args.baseVersion);
}
