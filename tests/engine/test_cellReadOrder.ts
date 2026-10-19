// A cell reads the same whether the formula reaches it before the walk has copied its value into
// the grid or after. Read early, `{v: null}` was "null", `{}` was the object itself and "5%" was 5;
// read late they were 0, 0 and 0.05. The generated check puts each value on both sides of the
// formula; rerun one seed with READ_ORDER_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import type { SpreadsheetCell } from "../../src/engine/types.ts";
import { cellAt } from "./cellAccess.ts";
import { pick, seededRandom } from "./seededRandom.ts";

/** The formula's value with `cell` after it in the walk (B1), and with `cell` before it (A1). */
function readBothWays(cell: SpreadsheetCell | undefined, formula: (ref: string) => string): [unknown, unknown] {
  const after = new SpreadsheetEngine().calculate({
    name: "S",
    data: [cell === undefined ? [{ v: formula("B1") }] : [{ v: formula("B1") }, cell]],
  } satisfies SheetData);
  const before = new SpreadsheetEngine().calculate({ name: "S", data: [[cell ?? {}, { v: formula("A1") }]] } satisfies SheetData);
  return [cellAt(after.data, 0, 0), cellAt(before.data, 0, 1)];
}

describe("a cell the formula reaches before the walk does", () => {
  it("reads a blank, in any form, as an absent cell does", () => {
    const [absent] = readBothWays(undefined, (ref) => `=${ref}+1`);
    assert.equal(absent, 1);
    [{ v: null }, {}, { v: "" }, { f: "#,##0" }].forEach((cell) =>
      assert.deepEqual(
        readBothWays(cell, (ref) => `=${ref}+1`),
        [1, 1],
        JSON.stringify(cell),
      ),
    );
  });

  it("reads a percent, a currency amount and a grouped number by their value", () => {
    assert.deepEqual(
      readBothWays({ v: "5%" }, (ref) => `=${ref}*100`),
      [5, 5],
    );
    assert.deepEqual(
      readBothWays({ v: "$1,000" }, (ref) => `=${ref}+1`),
      [1001, 1001],
    );
    assert.deepEqual(
      readBothWays({ v: "1,000" }, (ref) => `=${ref}+1`),
      [1001, 1001],
    );
  });

  it("keeps a word, a logical value and a number as they are", () => {
    assert.deepEqual(
      readBothWays({ v: "abc" }, (ref) => `=${ref}&"!"`),
      ["abc!", "abc!"],
    );
    assert.deepEqual(
      readBothWays({ v: true }, (ref) => `=IF(${ref},"y","n")`),
      ["y", "y"],
    );
    assert.deepEqual(
      readBothWays({ v: 2.5 }, (ref) => `=${ref}*2`),
      [5, 5],
    );
  });

  it("reads a blank inside a range the same way", () => {
    [{ v: null }, {}].forEach((cell) => {
      const data: SheetData["data"] = [[{ v: '=COUNTIF(B1:C1,"")' }, cell, { v: 2 }], [{ v: "=SUM(B1:C1)" }], [{ v: "=INDEX(B1:C1,1)" }]];
      const grid = new SpreadsheetEngine().calculate({ name: "S", data } satisfies SheetData).data;
      assert.deepEqual([cellAt(grid, 0, 0), cellAt(grid, 1, 0), cellAt(grid, 2, 0)], [1, 2, 0], JSON.stringify(cell));
    });
  });
});

const VALUES: SpreadsheetCell[] = [
  { v: null },
  {},
  { v: "" },
  { v: " " },
  { f: "0.00" },
  { v: 0 },
  { v: 3 },
  { v: -1.5 },
  { v: "7" },
  { v: "5%" },
  { v: "$1,250.50" },
  { v: "2,000" },
  { v: "abc" },
  { v: "TRUE" },
  { v: true },
  { v: false },
  { v: "2025-03-04" },
];
const FORMULAS: ((ref: string) => string)[] = [
  (ref) => `=${ref}+1`,
  (ref) => `=${ref}*2`,
  (ref) => `=${ref}&"|"`,
  (ref) => `=IF(${ref},1,2)`,
  (ref) => `=SUM(${ref},1)`,
  (ref) => `=ROUND(${ref},1)`,
  (ref) => `=${ref}>1`,
  (ref) => `=CONCATENATE(${ref},"|")`,
  (ref) => `=IFERROR(${ref}/2,"e")`,
];

const baseSeed = Number(process.env.READ_ORDER_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 400;

describe(`read order over generated cells (seed ${baseSeed})`, () => {
  it("answers alike with the cell after the formula or before it", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const [cell, formula] = [pick(random, VALUES), pick(random, FORMULAS)];
      const [after, before] = readBothWays(cell, formula);
      assert.deepEqual(after, before, `seed ${baseSeed}: ${formula("X")} over ${JSON.stringify(cell)}`);
    });
  });
});
