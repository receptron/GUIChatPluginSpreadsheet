// Where a spreadsheet lives in the host's shared artifacts area. The layout
// matches what MulmoClaude has always written, so workbooks saved before this
// package took over still open.

import { ARTIFACTS_ROOT } from "gui-chat-protocol";

const SPREADSHEET_DIR = "spreadsheets";
const SPREADSHEET_EXT = ".json";
const FILE_ID_HEX_LENGTH = 16;
const MONTH_DIGITS = 2;

export interface SpreadsheetPath {
  /** Relative to the artifacts root — what `files.artifacts` takes. */
  relPath: string;
  /** Workspace-relative — what the tool reports and the View dispatches. */
  filePath: string;
}

const yearMonthUtc = (now: Date): string => `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(MONTH_DIGITS, "0")}`;

const randomFileId = (): string => globalThis.crypto.randomUUID().split("-").join("").slice(0, FILE_ID_HEX_LENGTH);

export function spreadsheetArtifactPath(now: Date = new Date(), fileId: string = randomFileId()): SpreadsheetPath {
  const relPath = `${SPREADSHEET_DIR}/${yearMonthUtc(now)}/${fileId}${SPREADSHEET_EXT}`;
  return { relPath, filePath: `${ARTIFACTS_ROOT}/${relPath}` };
}

const UNSAFE_SEGMENTS = new Set(["", ".", ".."]);

/** True for a workspace-relative path inside `artifacts/spreadsheets/` ending
 *  in `.json`, with no traversal, empty, or backslash segments. */
export function isSpreadsheetArtifactPath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value.startsWith(`${ARTIFACTS_ROOT}/${SPREADSHEET_DIR}/`)) return false;
  if (!value.endsWith(SPREADSHEET_EXT) || value.includes("\\")) return false;
  return !value.split("/").some((segment) => UNSAFE_SEGMENTS.has(segment));
}

/** `artifacts/spreadsheets/…` → `spreadsheets/…`. Assumes the input passed
 *  `isSpreadsheetArtifactPath`. */
export const toArtifactsRelative = (filePath: string): string => filePath.slice(ARTIFACTS_ROOT.length + 1);
