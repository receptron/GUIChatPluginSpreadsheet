import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { effectScope, nextTick, ref } from "vue";
import { useCustomFunctions, definitionsKey } from "../../src/vue/useCustomFunctions.js";
import type { SpreadsheetSheet } from "../../src/core/types.js";
import { NO_CUSTOM_FUNCTIONS, type CustomFunctionSet } from "../../src/engine/customFunctions.js";

const withFunction = (body: string, value = 1): SpreadsheetSheet[] => [{ name: "S", functions: [{ name: "F", params: [], body }], data: [[{ v: value }]] }];

const POLL_MS = 10;
const WAIT_LIMIT_MS = 10_000;

/** Wait until `done` holds — QuickJS's first load takes a while on a busy machine — or fail. */
const until = async (done: () => boolean): Promise<void> => {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (!done()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the functions to load");
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
};

/** Let a watcher that should NOT fire have its chance to. */
const settle = async (): Promise<void> => {
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, POLL_MS * 5));
};

describe("definitionsKey", () => {
  it("changes with the definitions, not with the cells", () => {
    assert.equal(definitionsKey(withFunction("return 1;", 1)), definitionsKey(withFunction("return 1;", 2)));
    assert.notEqual(definitionsKey(withFunction("return 1;")), definitionsKey(withFunction("return 2;")));
  });
});

describe("useCustomFunctions", () => {
  it("loads the workbook's functions, and swaps them when the definitions change", async () => {
    const scope = effectScope();
    const sheets = ref<SpreadsheetSheet[]>(withFunction("return 1;"));
    const set = scope.run(() => useCustomFunctions(sheets));
    assert.ok(set);
    await until(() => set.value.definitions.has("F"));
    const first = set.value;
    assert.equal(first.definitions.has("F"), true);

    sheets.value = withFunction("return 1;", 5);
    await settle();
    assert.equal(set.value, first, "an edited cell does not reload the functions");

    sheets.value = withFunction("return 2;");
    await until(() => set.value !== first);
    assert.equal(set.value.definitions.has("F"), true);
    scope.stop();
  });

  it("keeps only the newest of two loads that overlap, and releases the older", async () => {
    const pending: { resolve: (set: CustomFunctionSet) => void; set: CustomFunctionSet; disposed: boolean }[] = [];
    const load = (): Promise<CustomFunctionSet> =>
      new Promise((resolve) => {
        const entry = { resolve, disposed: false, set: { ...NO_CUSTOM_FUNCTIONS } };
        entry.set = { ...NO_CUSTOM_FUNCTIONS, dispose: () => (entry.disposed = true) };
        pending.push(entry);
      });
    const scope = effectScope();
    const sheets = ref<SpreadsheetSheet[]>(withFunction("return 1;"));
    const set = scope.run(() => useCustomFunctions(sheets, load));
    assert.ok(set);
    sheets.value = withFunction("return 2;");
    await nextTick();
    const [older, newer] = pending;
    assert.ok(older && newer);
    newer.resolve(newer.set);
    await settle();
    older.resolve(older.set);
    await settle();
    assert.equal(set.value, newer.set, "the older load, landing last, did not win");
    assert.equal(older.disposed, true);
    scope.stop();
    assert.equal(newer.disposed, true, "stopping releases the set in use");
  });
});
