// A save names the version of the file it was made on, and the dispatch writes it
// only while the file is still that version. Without it, a save sent while an agent
// or another View wrote the file replaced that write without a word. The versions
// expected here come from node:crypto, not from the code under test. The generated
// runs print their seed; rerun one with SAVE_VERSION_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { FileOps } from "gui-chat-protocol";
import { contentVersion, isStaleBase } from "../../src/core/contentVersion.js";
import { executeSpreadsheetDispatch, isSpreadsheetDispatchArgs } from "../../src/core/dispatch.js";
import { readLoadReply, readSaveReply } from "../../src/core/dispatchReplies.js";
import type { SpreadsheetFileData, SpreadsheetSheet } from "../../src/core/types.js";
import { seededRandom } from "../engine/seededRandom.ts";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const path = "artifacts/spreadsheets/2026/10/fedcba9876543210.json";
const relPath = path.slice("artifacts/".length);
const book = (value: string | number): SpreadsheetSheet[] => [{ name: "S", data: [[{ v: value }]] }];

/** A file store whose reads and writes each wait `pause()` turns, so concurrent saves interleave. */
function slowStore(initial: string | null, pause: () => Promise<void> = async () => {}) {
  const state: { text: string | null; writes: { before: string | null; after: string }[] } = { text: initial, writes: [] };
  const ops: FileOps = {
    read: async () => {
      await pause();
      if (state.text === null) throw new Error(`ENOENT: ${relPath}`);
      return state.text;
    },
    readBytes: async () => new Uint8Array(),
    write: async (_rel, content) => {
      await pause();
      state.writes.push({ before: state.text, after: String(content) });
      state.text = String(content);
    },
    readDir: async () => [],
    stat: async () => ({ mtimeMs: 0, size: state.text?.length ?? 0 }),
    exists: async () => {
      await pause();
      return state.text !== null;
    },
    unlink: async () => {
      state.text = null;
    },
  };
  return { ops, state };
}

const save = (ops: FileOps, sheets: SpreadsheetSheet[], baseVersion?: string) =>
  executeSpreadsheetDispatch(
    ops,
    baseVersion === undefined ? { kind: "saveSpreadsheet", path, sheets } : { kind: "saveSpreadsheet", path, sheets, baseVersion },
  );

const dataOf = (result: { data?: SpreadsheetFileData }): SpreadsheetFileData => {
  assert.ok(result.data, "the dispatch answered data");
  return result.data;
};

describe("isStaleBase", () => {
  it("refuses only a save whose base differs from a file that is there", () => {
    assert.equal(isStaleBase("v1", "v1"), false);
    assert.equal(isStaleBase("v1", "v2"), true);
    assert.equal(isStaleBase(undefined, "v2"), false, "a save without a base is written as before");
    assert.equal(isStaleBase("v1", null), false, "a file that is gone is written again");
    assert.equal(isStaleBase("", "v1"), true, "an empty base is still a base");
  });
});

describe("contentVersion", () => {
  it("is the SHA-256 of the text, in hex", async () => {
    const texts = ["", "a", JSON.stringify(book(1)), "表 ✓ 😀", "\u0000￿", "x".repeat(10_000)];
    await Promise.all(texts.map(async (text) => assert.equal(await contentVersion(text), sha256(text), JSON.stringify(text.slice(0, 20)))));
  });

  it("tells apart texts that parse to the same sheets", async () => {
    const compact = JSON.stringify(book(1));
    const pretty = JSON.stringify(book(1), null, 2);
    assert.notEqual(await contentVersion(compact), await contentVersion(pretty));
  });
});

describe("a load names the file's version", () => {
  it("answers the version of the text as stored, whitespace included", async () => {
    const pretty = JSON.stringify(book("x"), null, 2);
    const { ops } = slowStore(pretty);
    assert.deepEqual(dataOf(await executeSpreadsheetDispatch(ops, { kind: "loadSpreadsheet", path })), { sheets: book("x"), version: sha256(pretty) });
  });
});

describe("a save with a base version", () => {
  it("writes over the version it was made on, and answers the new version", async () => {
    const before = JSON.stringify(book(1));
    const { ops, state } = slowStore(before);
    const data = dataOf(await save(ops, book(2), sha256(before)));
    assert.deepEqual(data, { sheets: path, version: sha256(JSON.stringify(book(2))) });
    assert.equal(state.text, JSON.stringify(book(2)));
  });

  it("answers a version the next load agrees with", async () => {
    const { ops } = slowStore(JSON.stringify(book(1)));
    const saved = dataOf(await save(ops, book(2)));
    const loaded = dataOf(await executeSpreadsheetDispatch(ops, { kind: "loadSpreadsheet", path }));
    assert.equal(saved.version, loaded.version);
  });

  it("does not write over a newer file, and answers that file", async () => {
    const theirs = JSON.stringify(book("theirs"), null, 1);
    const { ops, state } = slowStore(theirs);
    const result = await save(ops, book("mine"), sha256(JSON.stringify(book("original"))));
    assert.deepEqual(dataOf(result), { sheets: book("theirs"), version: sha256(theirs), conflict: true });
    assert.match(result.message ?? "", /Did not save/);
    assert.equal(state.text, theirs);
    assert.deepEqual(state.writes, []);
  });

  it("writes a file that is gone", async () => {
    const { ops, state } = slowStore(null);
    dataOf(await save(ops, book(1), "v-old"));
    assert.equal(state.text, JSON.stringify(book(1)));
  });

  it("rejects, without writing, when the newer file is not a workbook", async () => {
    const { ops, state } = slowStore(JSON.stringify({ not: "sheets" }));
    await assert.rejects(save(ops, book(1), "v-old"), /does not hold an array of sheets/);
    assert.deepEqual(state.writes, []);
  });
});

describe("a save without a base version", () => {
  it("writes whatever the file holds, as before", async () => {
    const { ops, state } = slowStore(JSON.stringify(book("someone else's")));
    assert.deepEqual(dataOf(await save(ops, book("mine"))), { sheets: path, version: sha256(JSON.stringify(book("mine"))) });
    assert.equal(state.text, JSON.stringify(book("mine")));
  });
});

describe("isSpreadsheetDispatchArgs with a base version", () => {
  it("takes a string base and no base, and refuses any other", () => {
    assert.equal(isSpreadsheetDispatchArgs({ kind: "saveSpreadsheet", path, sheets: book(1), baseVersion: "v1" }), true);
    assert.equal(isSpreadsheetDispatchArgs({ kind: "saveSpreadsheet", path, sheets: book(1) }), true);
    assert.equal(isSpreadsheetDispatchArgs({ kind: "saveSpreadsheet", path, sheets: book(1), baseVersion: 1 }), false);
    assert.equal(isSpreadsheetDispatchArgs({ kind: "saveSpreadsheet", path, sheets: book(1), baseVersion: null }), false);
  });
});

const turns = (count: number): Promise<void> =>
  Array.from({ length: count }).reduce<Promise<void>>((chain) => chain.then(() => new Promise((resolve) => setImmediate(resolve))), Promise.resolve());

describe("two saves made on the same version at once", () => {
  it("writes the first and refuses the second", async () => {
    const before = JSON.stringify(book(0));
    const { ops, state } = slowStore(before, () => turns(2));
    const [first, second] = await Promise.all([save(ops, book("A"), sha256(before)), save(ops, book("B"), sha256(before))]);
    assert.equal(dataOf(first).conflict, undefined);
    assert.deepEqual(dataOf(second), { sheets: book("A"), version: sha256(JSON.stringify(book("A"))), conflict: true });
    assert.equal(state.writes.length, 1);
  });
});

describe("readLoadReply and readSaveReply", () => {
  it("read what the dispatch answers", () => {
    assert.deepEqual(readLoadReply({ data: { sheets: book(1), version: "v1" } }), { sheets: book(1), version: "v1" });
    assert.deepEqual(readSaveReply({ data: { sheets: path, version: "v2" } }), { kind: "saved", version: "v2" });
    assert.deepEqual(readSaveReply({ data: { sheets: book(1), version: "v3", conflict: true } }), { kind: "conflict", sheets: book(1), version: "v3" });
  });

  it("read an answer without a version as one from an older plugin", () => {
    assert.deepEqual(readLoadReply({ data: { sheets: book(1) } }), { sheets: book(1), version: undefined });
    assert.deepEqual(readSaveReply({ data: { sheets: path } }), { kind: "saved", version: undefined });
    assert.deepEqual(readSaveReply(undefined), { kind: "saved", version: undefined });
    assert.deepEqual(readSaveReply({ data: { sheets: path, version: 7 } }), { kind: "saved", version: undefined });
    assert.deepEqual(
      readSaveReply({ data: { sheets: path, version: "v4", conflict: false } }),
      { kind: "saved", version: "v4" },
      "only conflict: true refuses",
    );
  });

  it("refuse a load without sheets and a conflict without the file", () => {
    [undefined, null, {}, { data: {} }, { data: { sheets: "x" } }, { data: { sheets: [{ name: 1 }] } }].forEach((raw) =>
      assert.equal(readLoadReply(raw), null, JSON.stringify(raw)),
    );
    [{ data: { conflict: true } }, { data: { conflict: true, version: "v" } }, { data: { conflict: true, sheets: book(1) } }].forEach((raw) =>
      assert.equal(readSaveReply(raw), null, JSON.stringify(raw)),
    );
  });
});

const MAX_PAUSE_TURNS = 4;
const STEPS_PER_VIEW = 6;
const RUNS = 30;
const baseSeed = Number(process.env.SAVE_VERSION_SEED ?? Date.now() % 1_000_000);

/** A store that records, for each write, the version the file was at just before it. */
function auditedStore(random: () => number) {
  const { ops, state } = slowStore(JSON.stringify(book("start")), () => turns(Math.floor(random() * MAX_PAUSE_TURNS)));
  const landedOn = new Map<string, string>();
  const audited: FileOps = {
    ...ops,
    write: async (rel, content) => {
      landedOn.set(String(content), sha256(state.text ?? ""));
      await ops.write(rel, content);
    },
  };
  return { ops: audited, landedOn };
}

/** One View: load, then edit and save; on a refusal, take the file it was answered and go on. */
async function runView(ops: FileOps, name: string, random: () => number, basedOn: Map<string, string>): Promise<{ saved: number; refused: number }> {
  const start = { saved: 0, refused: 0, seen: dataOf(await executeSpreadsheetDispatch(ops, { kind: "loadSpreadsheet", path })).version };
  // One save after another, as one View makes them: each is based on what the last answered.
  const tally = await Array.from({ length: STEPS_PER_VIEW }).reduce<Promise<typeof start>>(async (previous, _, step) => {
    const current = await previous;
    await turns(Math.floor(random() * MAX_PAUSE_TURNS));
    const sheets = book(`${name}-${step}`);
    basedOn.set(JSON.stringify(sheets), current.seen);
    const data = dataOf(await save(ops, sheets, current.seen));
    return data.conflict ? { ...current, refused: current.refused + 1, seen: data.version } : { ...current, saved: current.saved + 1, seen: data.version };
  }, Promise.resolve(start));
  return { saved: tally.saved, refused: tally.refused };
}

/** One generated run: Views save one file at once, and every write is checked against its base. */
async function runInterleaving(random: () => number, run: number): Promise<void> {
  const { ops, landedOn } = auditedStore(random);
  const basedOn = new Map<string, string>();
  const viewCount = 2 + Math.floor(random() * 3);
  const tallies = await Promise.all(Array.from({ length: viewCount }, (_, index) => runView(ops, `view${index}-run${run}`, random, basedOn)));
  const label = `seed ${baseSeed} run ${run}`;
  landedOn.forEach((before, written) => assert.equal(before, basedOn.get(written), `${label}: ${written} was written over a version it was not made on`));
  assert.equal(
    landedOn.size,
    tallies.reduce((total, tally) => total + tally.saved, 0),
    `${label}: each answered save was written once`,
  );
  assert.ok(
    tallies.some((tally) => tally.saved > 0),
    `${label}: some save got through`,
  );
}

describe("Views saving one file in generated interleavings", () => {
  it(`write each save only over the version it was made on (seed ${baseSeed})`, async () => {
    const random = seededRandom(baseSeed);
    // Runs one after another, so a seed replays the same interleavings.
    await Array.from({ length: RUNS }).reduce<Promise<void>>(async (previous, _, run) => {
      await previous;
      await runInterleaving(random, run);
    }, Promise.resolve());
  });
});

describe("a save after an agent wrote the file", () => {
  it("is refused, and the agent's write stays", async () => {
    const start = JSON.stringify(book("start"));
    const { ops, state } = slowStore(start);
    const seen = dataOf(await executeSpreadsheetDispatch(ops, { kind: "loadSpreadsheet", path })).version;
    const agentText = JSON.stringify(book("agent"), null, 2);
    await ops.write(relPath, agentText);
    const data = dataOf(await save(ops, book("view"), seen));
    assert.deepEqual(data, { sheets: book("agent"), version: sha256(agentText), conflict: true });
    assert.equal(state.text, agentText);
  });
});
