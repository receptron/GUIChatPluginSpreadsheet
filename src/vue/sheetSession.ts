// Ordering rules for the View's host round-trips, kept free of Vue so they can
// be tested with out-of-order promises: only the newest load may land, and
// saves reach the host in the order they were made.

import { createSerialLock } from "gui-chat-protocol";
import { isSpreadsheetArtifactPath } from "../core/paths";
import { readSheets } from "../core/sheetGuards";
import type { SpreadsheetSheet } from "../core/types";

export interface SheetSessionHost {
  loadFromHost(path: string): Promise<SpreadsheetSheet[]>;
  saveToHost(path: string, sheets: SpreadsheetSheet[]): Promise<unknown>;
}

export type LoadOutcome =
  { kind: "sheets"; sheets: SpreadsheetSheet[] } | { kind: "notSheets" } | { kind: "noHost"; path: string } | { kind: "loadFailed"; error: unknown };

export interface SheetSession {
  /** Resolves to null when a newer `load` started before this one finished. */
  load(raw: unknown): Promise<LoadOutcome | null>;
  /** Waits for every earlier save, so the last edit made is the last written. */
  save(path: string, sheets: SpreadsheetSheet[]): Promise<void>;
}

async function resolveSheets(raw: unknown, host: SheetSessionHost | null): Promise<LoadOutcome> {
  if (!raw) return { kind: "sheets", sheets: [] };
  if (!isSpreadsheetArtifactPath(raw)) {
    const inline = readSheets(raw);
    return inline ? { kind: "sheets", sheets: inline } : { kind: "notSheets" };
  }
  if (!host) return { kind: "noHost", path: raw };
  try {
    return { kind: "sheets", sheets: await host.loadFromHost(raw) };
  } catch (error) {
    return { kind: "loadFailed", error };
  }
}

export function createSheetSession(host: SheetSessionHost | null): SheetSession {
  const withSaveLock = createSerialLock();
  let latestLoad = 0;

  return {
    async load(raw) {
      latestLoad += 1;
      const ticket = latestLoad;
      const outcome = await resolveSheets(raw, host);
      return ticket === latestLoad ? outcome : null;
    },
    async save(path, sheets) {
      if (!host) throw new Error(`No host runtime to save ${path}`);
      await withSaveLock(() => host.saveToHost(path, sheets));
    },
  };
}
