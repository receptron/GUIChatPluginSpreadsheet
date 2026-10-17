import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSheetSession, type SheetSessionHost } from "../../src/vue/sheetSession.js";
import type { SpreadsheetSheet } from "../../src/core/types.js";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const sheet = (name: string): SpreadsheetSheet[] => [{ name, data: [[{ v: name }]] }];
const pathA = "artifacts/spreadsheets/2026/10/aaaaaaaaaaaaaaaa.json";
const pathB = "artifacts/spreadsheets/2026/10/bbbbbbbbbbbbbbbb.json";

/** A host whose loads and saves finish only when the test says so. */
function controlledHost() {
  const loads = new Map<string, Deferred<SpreadsheetSheet[]>>();
  const saveCalls: { path: string; sheets: SpreadsheetSheet[]; done: Deferred<unknown> }[] = [];
  const written: string[] = [];
  const host: SheetSessionHost = {
    loadFromHost: (path) => {
      const pending = deferred<SpreadsheetSheet[]>();
      loads.set(path, pending);
      return pending.promise;
    },
    saveToHost: async (path, sheets) => {
      const done = deferred<unknown>();
      saveCalls.push({ path, sheets, done });
      await done.promise;
      written.push(sheets[0]?.name ?? "");
    },
  };
  return { host, loads, saveCalls, written };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("createSheetSession.load", () => {
  it("drops a load that finishes after a newer one started (A then B, A resolves last)", async () => {
    const { host, loads } = controlledHost();
    const session = createSheetSession(host);
    const first = session.load(pathA);
    const second = session.load(pathB);
    loads.get(pathB)?.resolve(sheet("B"));
    loads.get(pathA)?.resolve(sheet("A"));
    assert.deepEqual(await second, { kind: "sheets", sheets: sheet("B") });
    assert.equal(await first, null);
  });

  it("drops an older load even when it finishes first", async () => {
    const { host, loads } = controlledHost();
    const session = createSheetSession(host);
    const first = session.load(pathA);
    const second = session.load(pathB);
    loads.get(pathA)?.resolve(sheet("A"));
    assert.equal(await first, null);
    loads.get(pathB)?.resolve(sheet("B"));
    assert.deepEqual(await second, { kind: "sheets", sheets: sheet("B") });
  });

  it("drops a file load overtaken by an inline result", async () => {
    const { host, loads } = controlledHost();
    const session = createSheetSession(host);
    const first = session.load(pathA);
    assert.deepEqual(await session.load(sheet("inline")), { kind: "sheets", sheets: sheet("inline") });
    loads.get(pathA)?.resolve(sheet("A"));
    assert.equal(await first, null);
  });

  it("reports a failed load as loadFailed, not as a throw", async () => {
    const { host, loads } = controlledHost();
    const session = createSheetSession(host);
    const pending = session.load(pathA);
    loads.get(pathA)?.reject(new Error("HTTP 400"));
    const outcome = await pending;
    assert.equal(outcome?.kind, "loadFailed");
  });

  it("classifies what it was given", async () => {
    const session = createSheetSession(null);
    assert.deepEqual(await session.load(undefined), { kind: "sheets", sheets: [] });
    assert.deepEqual(await session.load(""), { kind: "sheets", sheets: [] });
    assert.deepEqual(await session.load(sheet("x")), { kind: "sheets", sheets: sheet("x") });
    assert.deepEqual(await session.load([{ name: "bad" }]), { kind: "notSheets" });
    assert.deepEqual(await session.load("not a path"), { kind: "notSheets" });
    assert.deepEqual(await session.load(pathA), { kind: "noHost", path: pathA });
  });
});

describe("createSheetSession.save", () => {
  it("writes saves in the order they were made, even when the first is slow", async () => {
    const { host, saveCalls, written } = controlledHost();
    const session = createSheetSession(host);
    const older = session.save(pathA, sheet("edit-1"));
    const newer = session.save(pathA, sheet("edit-2"));
    await tick();
    assert.equal(saveCalls.length, 1, "the second save waits for the first");
    saveCalls[0]?.done.resolve(undefined);
    await older;
    await tick();
    assert.equal(saveCalls.length, 2);
    saveCalls[1]?.done.resolve(undefined);
    await newer;
    assert.deepEqual(written, ["edit-1", "edit-2"]);
  });

  it("keeps saving after a failed save, and reports the failure to its caller", async () => {
    const { host, saveCalls, written } = controlledHost();
    const session = createSheetSession(host);
    const failing = session.save(pathA, sheet("edit-1"));
    const next = session.save(pathA, sheet("edit-2"));
    await tick();
    saveCalls[0]?.done.reject(new Error("disk full"));
    await assert.rejects(failing, /disk full/);
    await tick();
    saveCalls[1]?.done.resolve(undefined);
    await next;
    assert.deepEqual(written, ["edit-2"]);
  });

  it("refuses to save without a host", async () => {
    await assert.rejects(createSheetSession(null).save(pathA, sheet("x")), /No host runtime/);
  });
});
