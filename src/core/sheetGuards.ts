// Runtime checks for a workbook that arrived from outside the type system —
// a tool call, a session replay, a file on disk, a dispatch body.

import { isRecord } from "../engine/guards";
import type { SpreadsheetCellValue, SpreadsheetSheet, StorableCell } from "./types";

const isCellValue = (value: unknown): value is SpreadsheetCellValue => typeof value === "string" || typeof value === "number" || typeof value === "boolean";

// Each predicate claims exactly the union member it proves: `StorableCell`
// covers the four forms a stored workbook holds — `{ v, f }`, an empty `{}` or
// `{ v: null }`, a bare value, and a `null` gap — because `normalizeData`
// folds all four and a reader that took only `{ v }` would reject workbooks
// the app renders today.
const isStorableCell = (value: unknown): value is StorableCell =>
  value === null ||
  isCellValue(value) ||
  (isRecord(value) &&
    (value["v"] === undefined || value["v"] === null || isCellValue(value["v"])) &&
    (value["f"] === undefined || typeof value["f"] === "string"));

const isCellRow = (value: unknown): value is StorableCell[] => Array.isArray(value) && value.every(isStorableCell);

export const isSheet = (value: unknown): value is SpreadsheetSheet =>
  isRecord(value) && typeof value["name"] === "string" && Array.isArray(value["data"]) && value["data"].every(isCellRow);

/** Taken whole or rejected whole — dropping the unreadable half of a workbook
 *  would hide part of a user's file behind cells that merely look empty. */
export function readSheets(value: unknown): SpreadsheetSheet[] | null {
  return Array.isArray(value) && value.every(isSheet) ? value : null;
}
