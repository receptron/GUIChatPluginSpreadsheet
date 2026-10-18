// Ordering rules for the View's host round-trips, kept free of Vue so they can
// be tested with out-of-order promises: only the newest load may land, saves
// reach the host in the order they were made, and each save names the version
// of the file it was made on.

import { createSerialLock } from "gui-chat-protocol";
import type { LoadedWorkbook, SaveReply } from "../core/dispatchReplies";
import { isSpreadsheetArtifactPath } from "../core/paths";
import { readSheets } from "../core/sheetGuards";
import type { SpreadsheetSheet } from "../core/types";

export interface SheetSessionHost {
  loadFromHost(path: string): Promise<LoadedWorkbook>;
  saveToHost(path: string, sheets: SpreadsheetSheet[], baseVersion: string | undefined): Promise<SaveReply>;
}

export type LoadOutcome =
  | { kind: "sheets"; sheets: SpreadsheetSheet[]; version?: string }
  | { kind: "notSheets" }
  | { kind: "noHost"; path: string }
  | { kind: "loadFailed"; error: unknown };

export interface SheetSession {
  /** Resolves to null when a newer `load` started before this one finished. */
  load(raw: unknown): Promise<LoadOutcome | null>;
  /** Waits for every earlier save, so the last edit made is the last written. A save is
   *  written only over the version last adopted or saved; otherwise it answers a conflict. */
  save(path: string, sheets: SpreadsheetSheet[]): Promise<SaveReply>;
  /** The version of the sheets now on screen. Only what is shown may be a save's base: a
   *  loaded file the View held back from showing must still conflict. */
  adopt(path: string, version: string | undefined): void;
}

async function loadFromHost(host: SheetSessionHost, path: string): Promise<LoadOutcome> {
  const { sheets, version } = await host.loadFromHost(path);
  return version === undefined ? { kind: "sheets", sheets } : { kind: "sheets", sheets, version };
}

async function resolveSheets(raw: unknown, host: SheetSessionHost | null): Promise<LoadOutcome> {
  if (!raw) return { kind: "sheets", sheets: [] };
  if (!isSpreadsheetArtifactPath(raw)) {
    const inline = readSheets(raw);
    return inline ? { kind: "sheets", sheets: inline } : { kind: "notSheets" };
  }
  if (!host) return { kind: "noHost", path: raw };
  try {
    return await loadFromHost(host, raw);
  } catch (error) {
    return { kind: "loadFailed", error };
  }
}

export function createSheetSession(host: SheetSessionHost | null): SheetSession {
  const withSaveLock = createSerialLock();
  const versions = new Map<string, string | undefined>();
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
      // The base is read when the save runs, not when it was queued: an earlier save
      // of this View's that landed in between moved the file to its own version.
      return withSaveLock(async () => {
        const reply = await host.saveToHost(path, sheets, versions.get(path));
        if (reply.kind === "saved") versions.set(path, reply.version);
        return reply;
      });
    },
    adopt(path, version) {
      versions.set(path, version);
    },
  };
}
