// Reading what a load or save dispatch answered, on the View's side of the
// round trip. The answer arrives as `unknown` from the host.

import { isRecord } from "../engine/guards";
import { readSheets } from "./sheetGuards";
import type { SpreadsheetSheet } from "./types";

export interface LoadedWorkbook {
  sheets: SpreadsheetSheet[];
  /** Absent when the answering plugin predates versions; saves are then unconditional. */
  version: string | undefined;
}

export type SaveReply = { kind: "saved"; version: string | undefined } | { kind: "conflict"; sheets: SpreadsheetSheet[]; version: string };

const dataOf = (raw: unknown): Record<string, unknown> | null => (isRecord(raw) && isRecord(raw["data"]) ? raw["data"] : null);

const versionOf = (data: Record<string, unknown>): string | undefined => (typeof data["version"] === "string" ? data["version"] : undefined);

/** The workbook a load answered, or null when the answer holds no sheets. */
export function readLoadReply(raw: unknown): LoadedWorkbook | null {
  const data = dataOf(raw);
  const sheets = data ? readSheets(data["sheets"]) : null;
  return data && sheets ? { sheets, version: versionOf(data) } : null;
}

/** What a save answered, or null for a conflict that does not carry the file's sheets and
 *  version. Any other answer is a save: an older plugin answers `{ sheets: path }` only. */
export function readSaveReply(raw: unknown): SaveReply | null {
  const data = dataOf(raw);
  if (data?.["conflict"] !== true) return { kind: "saved", version: data ? versionOf(data) : undefined };
  const sheets = readSheets(data["sheets"]);
  const version = versionOf(data);
  return sheets && version !== undefined ? { kind: "conflict", sheets, version } : null;
}
