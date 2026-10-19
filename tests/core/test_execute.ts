import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { FileOps, ToolContext } from "gui-chat-protocol";
import { executeSpreadsheet, pluginCore } from "../../src/core/plugin.js";
import type { CustomFunctionSpec } from "../../src/engine/customFunctionSpecs.js";
import { executeSpreadsheetDispatch, isSpreadsheetDispatchArgs } from "../../src/core/dispatch.js";
import type { SpreadsheetDispatchArgs, SpreadsheetSheet } from "../../src/core/types.js";

/** In-memory `files.artifacts`, keyed by the artifacts-relative path. */
function memoryFiles(initial: Record<string, string> = {}): FileOps & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial));
  const read = async (rel: string): Promise<string> => {
    const content = store.get(rel);
    if (content === undefined) throw new Error(`ENOENT: ${rel}`);
    return content;
  };
  return {
    store,
    read,
    readBytes: async (rel) => new TextEncoder().encode(await read(rel)),
    write: async (rel, content) => {
      store.set(rel, typeof content === "string" ? content : new TextDecoder().decode(content));
    },
    readDir: async () => [],
    stat: async () => ({ mtimeMs: 0, size: 0 }),
    exists: async (rel) => store.has(rel),
    unlink: async (rel) => {
      store.delete(rel);
    },
  };
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const hostContext = (artifacts: FileOps): ToolContext => {
  const context: ToolContext & { files: { artifacts: FileOps } } = { files: { artifacts } };
  return context;
};

const sheets: SpreadsheetSheet[] = [
  {
    name: "Budget",
    data: [
      [{ v: "Income" }, { v: 5000 }],
      [{ v: "Total" }, { v: "=B1" }],
    ],
  },
];
const savedPath = "artifacts/spreadsheets/2026/10/0123456789abcdef.json";

describe("executeSpreadsheet without files.artifacts", () => {
  it("returns the workbook inline, as before", async () => {
    const result = await executeSpreadsheet({}, { title: "T", sheets });
    assert.deepEqual(result.data, { sheets });
    assert.equal(result.title, "T");
    assert.equal(result.message, "Created spreadsheet: T");
  });

  it("parses a stringified sheets array", async () => {
    const stringified: unknown = JSON.stringify(sheets);
    const args = { title: "T", sheets };
    Object.assign(args, { sheets: stringified });
    const result = await executeSpreadsheet({}, args);
    assert.deepEqual(result.data, { sheets });
  });

  const invalid: [string, unknown][] = [
    ["empty array", []],
    ["unparseable string", "not json"],
    ["sheet without name", [{ data: [[{ v: 1 }]] }]],
    ["sheet without rows", [{ name: "S", data: [] }]],
  ];
  it("keeps the JSON parse error as the cause of an unparseable string", async () => {
    const args = { title: "T", sheets };
    Object.assign(args, { sheets: "not json" });
    await assert.rejects(executeSpreadsheet({}, args), (error: unknown) => error instanceof Error && error.cause instanceof SyntaxError);
  });

  invalid.forEach(([label, value]) => {
    it(`throws for ${label}`, async () => {
      const args = { title: "T", sheets };
      Object.assign(args, { sheets: value });
      await assert.rejects(executeSpreadsheet({}, args));
    });
  });
});

describe("executeSpreadsheet with files.artifacts", () => {
  it("saves the workbook and returns its path", async () => {
    const files = memoryFiles();
    const result = await executeSpreadsheet(hostContext(files), { title: "T", sheets });
    const path = result.data?.sheets;
    assert.equal(typeof path, "string");
    assert.match(String(path), /^artifacts\/spreadsheets\/\d{4}\/\d{2}\/[0-9a-f]{16}\.json$/);
    assert.deepEqual(JSON.parse(files.store.get(String(path).slice("artifacts/".length)) ?? ""), sheets);
    assert.ok(result.message.includes(String(path)), "the model is told where to read edits back");
  });

  it("writes nothing when validation fails", async () => {
    const files = memoryFiles();
    const args = { title: "T", sheets };
    Object.assign(args, { sheets: [] });
    await assert.rejects(executeSpreadsheet(hostContext(files), args));
    assert.equal(files.store.size, 0);
  });
});

describe("isSpreadsheetDispatchArgs", () => {
  it("accepts load and save", () => {
    assert.equal(isSpreadsheetDispatchArgs({ kind: "loadSpreadsheet", path: savedPath }), true);
    assert.equal(isSpreadsheetDispatchArgs({ kind: "saveSpreadsheet", path: savedPath, sheets }), true);
  });

  const rejected: [string, unknown][] = [
    ["null", null],
    ["unknown kind", { kind: "deleteSpreadsheet", path: savedPath }],
    ["missing path", { kind: "loadSpreadsheet" }],
    ["save without sheets", { kind: "saveSpreadsheet", path: savedPath }],
    ["save with malformed sheets", { kind: "saveSpreadsheet", path: savedPath, sheets: [{ name: "S" }] }],
  ];
  rejected.forEach(([label, value]) => {
    it(`rejects ${label}`, () => assert.equal(isSpreadsheetDispatchArgs(value), false));
  });
});

describe("executeSpreadsheetDispatch", () => {
  const rel = savedPath.slice("artifacts/".length);

  it("loads a saved workbook", async () => {
    const files = memoryFiles({ [rel]: JSON.stringify(sheets) });
    const result = await executeSpreadsheetDispatch(files, { kind: "loadSpreadsheet", path: savedPath });
    assert.deepEqual(result.data, { sheets, version: sha256(JSON.stringify(sheets)) });
  });

  it("saves edits over the same file", async () => {
    const files = memoryFiles({ [rel]: JSON.stringify(sheets) });
    const edited: SpreadsheetSheet[] = [{ name: "Budget", data: [[{ v: "Income" }, { v: 6000 }]] }];
    const result = await executeSpreadsheetDispatch(files, { kind: "saveSpreadsheet", path: savedPath, sheets: edited });
    assert.deepEqual(result.data, { sheets: savedPath, version: sha256(JSON.stringify(edited)) });
    assert.deepEqual(JSON.parse(files.store.get(rel) ?? ""), edited);
  });

  it("rejects a file that is not a workbook", async () => {
    const files = memoryFiles({ [rel]: JSON.stringify({ secret: 1 }) });
    await assert.rejects(executeSpreadsheetDispatch(files, { kind: "loadSpreadsheet", path: savedPath }));
  });

  it("propagates a missing file", async () => {
    await assert.rejects(executeSpreadsheetDispatch(memoryFiles(), { kind: "loadSpreadsheet", path: savedPath }), /ENOENT/);
  });

  ["artifacts/spreadsheets/../html/x.json", "artifacts/charts/x.json", "../outside.json", "artifacts/spreadsheets/x.txt"].forEach((path) => {
    it(`refuses ${path} without touching files`, async () => {
      const files = memoryFiles();
      await assert.rejects(executeSpreadsheetDispatch(files, { kind: "saveSpreadsheet", path, sheets }), /artifacts\/spreadsheets/);
      await assert.rejects(executeSpreadsheetDispatch(files, { kind: "loadSpreadsheet", path }), /artifacts\/spreadsheets/);
      assert.equal(files.store.size, 0);
    });
  });
});

describe("pluginCore.execute routing", () => {
  it("creates on a tool call", async () => {
    const files = memoryFiles();
    const result = await pluginCore.execute(hostContext(files), { title: "T", sheets });
    assert.equal(typeof result.data?.sheets, "string");
    assert.equal(files.store.size, 1);
  });

  it("loads and saves on a dispatch", async () => {
    const files = memoryFiles();
    const created = await pluginCore.execute(hostContext(files), { title: "T", sheets });
    const path = String(created.data?.sheets);
    const edited: SpreadsheetSheet[] = [{ name: "Budget", data: [[{ v: 1 }]] }];
    await pluginCore.execute(hostContext(files), { kind: "saveSpreadsheet", path, sheets: edited });
    const loaded = await pluginCore.execute(hostContext(files), { kind: "loadSpreadsheet", path });
    assert.deepEqual(loaded.data, { sheets: edited, version: sha256(JSON.stringify(edited)) });
  });

  it("rejects a dispatch when the host has no files.artifacts", async () => {
    await assert.rejects(pluginCore.execute({}, { kind: "loadSpreadsheet", path: savedPath }), /files\.artifacts/);
  });

  it("rejects a malformed dispatch", async () => {
    const files = memoryFiles();
    const args: SpreadsheetDispatchArgs = { kind: "loadSpreadsheet", path: savedPath };
    Object.assign(args, { kind: "wipe" });
    await assert.rejects(pluginCore.execute(hostContext(files), args), /Invalid spreadsheet dispatch/);
  });
});

// A function the agent defined that cannot be used is said in the reply (#114): otherwise its
// cells show #NAME? with nothing saying why.
describe("executeSpreadsheet — a workbook's functions", () => {
  const sheet = (functions: CustomFunctionSpec[]): SpreadsheetSheet[] => [{ name: "S", functions, data: [[{ v: 1 }]] }];

  it("says which functions cannot be used, and why", async () => {
    const result = await executeSpreadsheet(
      {},
      {
        title: "t",
        sheets: sheet([
          { name: "SUM", params: [], body: "return 1;" },
          { name: "OK", params: [], body: "return 1;" },
        ]),
      },
    );
    assert.match(result.message ?? "", /SUM \(SUM is a built-in function\)/);
    assert.doesNotMatch(result.message ?? "", /OK \(/);
  });

  it("says nothing extra when every function can be used", async () => {
    const result = await executeSpreadsheet({}, { title: "t", sheets: sheet([{ name: "OK", params: [], body: "return 1;" }]) });
    assert.equal(result.message, "Created spreadsheet: t");
  });

  it("keeps the functions in the saved workbook", async () => {
    const files = memoryFiles();
    const result = await executeSpreadsheet(hostContext(files), { title: "t", sheets: sheet([{ name: "OK", params: ["x"], body: "return x;" }]) });
    const saved = JSON.parse([...files.store.values()][0] ?? "[]");
    assert.deepEqual(saved[0].functions, [{ name: "OK", params: ["x"], body: "return x;" }]);
    assert.equal(typeof result.data?.sheets, "string");
  });
});
