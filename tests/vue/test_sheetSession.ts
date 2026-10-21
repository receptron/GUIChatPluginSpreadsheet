import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSheetSession, type SheetSessionHost } from "../../src/vue/sheetSession.js";
import type { SaveReply } from "../../src/core/dispatchReplies.js";
import type { SpreadsheetSheet } from "../../src/core/types.js";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  const settle: Partial<Pick<Deferred<T>, "resolve" | "reject">> = {};
  // The executor runs before the constructor returns, so both are set from here on.
  const promise = new Promise<T>((resolve, reject) => Object.assign(settle, { resolve, reject }));
  return { promise, resolve: (value) => settle.resolve?.(value), reject: (error) => settle.reject?.(error) };
}

const sheet = (name: string): SpreadsheetSheet[] => [{ name, data: [[{ v: name }]] }];
const pathA = "artifacts/spreadsheets/2026/10/aaaaaaaaaaaaaaaa.json";
const pathB = "artifacts/spreadsheets/2026/10/bbbbbbbbbbbbbbbb.json";

const saved = (version?: string): SaveReply => ({ kind: "saved", version });

/** A host whose loads and saves finish only when the test says so. A load resolves to
 *  sheets alone (no version) unless the test resolves `versionedLoads` instead. */
function controlledHost() {
  const loads = new Map<string, Deferred<SpreadsheetSheet[]>>();
  const versions = new Map<string, string>();
  const saveCalls: { path: string; sheets: SpreadsheetSheet[]; baseVersion: string | undefined; done: Deferred<SaveReply> }[] = [];
  const written: string[] = [];
  const host: SheetSessionHost = {
    loadFromHost: async (path) => {
      const pending = deferred<SpreadsheetSheet[]>();
      loads.set(path, pending);
      return { sheets: await pending.promise, version: versions.get(path) };
    },
    saveToHost: async (path, sheets, baseVersion) => {
      const done = deferred<SaveReply>();
      saveCalls.push({ path, sheets, baseVersion, done });
      const reply = await done.promise;
      if (reply.kind === "saved") written.push(sheets[0]?.name ?? "");
      return reply;
    },
  };
  return { host, loads, versions, saveCalls, written };
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

  it("carries the version a host load answered", async () => {
    const { host, loads, versions } = controlledHost();
    versions.set(pathA, "v1");
    const pending = createSheetSession(host).load(pathA);
    await tick();
    loads.get(pathA)?.resolve(sheet("A"));
    assert.deepEqual(await pending, { kind: "sheets", sheets: sheet("A"), version: "v1" });
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

const conflict: SaveReply = { kind: "conflict", sheets: sheet("theirs"), version: "v9" };

/** A session over a controlled host, and a way to answer its next save: it waits for
 *  the save to reach the host, answers `reply`, and gives back the base the save named. */
function versionedSession() {
  const controlled = controlledHost();
  const session = createSheetSession(controlled.host);
  const answered = { count: 0 };
  const answerSave = async (pending: Promise<SaveReply>, reply: SaveReply): Promise<{ base: string | undefined; reply: SaveReply }> => {
    await tick();
    const call = controlled.saveCalls.at(-1);
    assert.ok(call && controlled.saveCalls.length > answered.count, "the save reached the host");
    answered.count = controlled.saveCalls.length;
    call.done.resolve(reply);
    return { base: call.baseVersion, reply: await pending };
  };
  return { ...controlled, session, answerSave };
}

describe("createSheetSession.save", () => {
  it("writes saves in the order they were made, even when the first is slow", async () => {
    const { host, saveCalls, written } = controlledHost();
    const session = createSheetSession(host);
    const older = session.save(pathA, sheet("edit-1"));
    const newer = session.save(pathA, sheet("edit-2"));
    await tick();
    assert.equal(saveCalls.length, 1, "the second save waits for the first");
    saveCalls[0]?.done.resolve(saved());
    await older;
    await tick();
    assert.equal(saveCalls.length, 2);
    saveCalls[1]?.done.resolve(saved());
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
    saveCalls[1]?.done.resolve(saved());
    await next;
    assert.deepEqual(written, ["edit-2"]);
  });

  it("names no base before a version is adopted", async () => {
    const { session, answerSave } = versionedSession();
    assert.equal((await answerSave(session.save(pathA, sheet("x")), saved("v1"))).base, undefined);
  });

  it("names the adopted version, per path", async () => {
    const { session, answerSave } = versionedSession();
    session.adopt(pathA, "a1");
    session.adopt(pathB, "b1");
    assert.equal((await answerSave(session.save(pathB, sheet("x")), saved("b2"))).base, "b1");
    assert.equal((await answerSave(session.save(pathA, sheet("y")), saved("a2"))).base, "a1");
  });

  // Queued behind the first save, the second must not carry the version that was
  // current when it was queued: the first save moved the file on.
  it("bases a queued save on the version the save before it wrote", async () => {
    const { session, answerSave } = versionedSession();
    session.adopt(pathA, "v1");
    const first = session.save(pathA, sheet("edit-1"));
    const second = session.save(pathA, sheet("edit-2"));
    await answerSave(first, saved("v2"));
    assert.equal((await answerSave(second, saved("v3"))).base, "v2");
  });

  it("passes a conflict back and keeps the version it was based on", async () => {
    const { session, answerSave, written } = versionedSession();
    session.adopt(pathA, "v1");
    const refused = await answerSave(session.save(pathA, sheet("mine")), conflict);
    assert.deepEqual(refused.reply, conflict);
    assert.equal((await answerSave(session.save(pathA, sheet("mine")), saved("v10"))).base, "v1", "a refused save does not move the base");
    assert.deepEqual(written, ["mine"]);
  });

  it("bases a save on a version adopted after a conflict", async () => {
    const { session, answerSave } = versionedSession();
    session.adopt(pathA, "v1");
    await answerSave(session.save(pathA, sheet("mine")), conflict);
    session.adopt(pathA, "v9");
    assert.equal((await answerSave(session.save(pathA, sheet("mine")), saved("v10"))).base, "v9");
  });

  it("does not move the base when a save fails", async () => {
    const { session, answerSave, saveCalls } = versionedSession();
    session.adopt(pathA, "v1");
    const failing = session.save(pathA, sheet("x"));
    await tick();
    saveCalls[0]?.done.reject(new Error("disk full"));
    await assert.rejects(failing);
    assert.equal((await answerSave(session.save(pathA, sheet("x")), saved("v2"))).base, "v1");
  });

  it("refuses to save without a host", async () => {
    await assert.rejects(createSheetSession(null).save(pathA, sheet("x")), /No host runtime/);
  });
});
