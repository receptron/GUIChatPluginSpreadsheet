// A range written with $ anchors or in lowercase names the same cells as the plain one, for the
// lookups that read a range's bounds (VLOOKUP, HLOOKUP, INDEX) as for every other reader. The
// generated check writes each range every way and expects one answer; rerun one seed with
// ANCHOR_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRangeBounds } from "../../src/engine/formulaRefs.ts";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { cellAt } from "./cellAccess.ts";
import { pick, seededRandom, type Random } from "./seededRandom.ts";

describe("parseRangeBounds", () => {
  it("reads $ anchors and lowercase as the plain range", () => {
    const plain = parseRangeBounds("A2:C9");
    assert.ok(plain);
    ["$A$2:$C$9", "$A2:C$9", "A$2:$C9", "a2:c9", "$a$2:$c$9"].forEach((range) => assert.deepEqual(parseRangeBounds(range), plain, range));
  });

  it("keeps the sheet prefix as written", () => {
    assert.deepEqual(parseRangeBounds("'My Sheet'!$A$1:$B$2"), { sheetPrefix: "'My Sheet'!", startCol: 0, startRow: 1, endCol: 1, endRow: 2 });
    assert.equal(parseRangeBounds("data!a1:b2")?.sheetPrefix, "data!");
  });

  it("is still null for what is not a two-ended range", () => {
    ["A1", "$A$1", "A1:B2:C3", "A:B", "1:2", "", "$:$", "A$$1:B2", "$$A1:B2", "A1$:B2", "$A$1:$B$2$", "A1:$B2$"].forEach((range) =>
      assert.equal(parseRangeBounds(range), null, range),
    );
  });
});

describe("lookups over an anchored or lowercase range", () => {
  const sheets: SheetData[] = [
    {
      name: "Season",
      data: [
        [{ v: 1 }, { v: "a" }, { v: 2 }],
        [{ v: 2 }, { v: "b" }, { v: 4 }],
      ],
    },
    {
      name: "S",
      data: [
        [{ v: 1 }, { v: "a" }, { v: 2 }],
        [{ v: 2 }, { v: "b" }, { v: 4 }],
        ...[
          "=VLOOKUP(2,$A$1:$C$2,3,FALSE)",
          "=vlookup(2,a1:c2,3,false)",
          "=VLOOKUP(2,Season!$A$1:$C$2,3,FALSE)",
          "=HLOOKUP(1,$A$1:$C$2,2,FALSE)",
          "=INDEX($A$1:$C$2,2,2)",
          "=index(a1:c2,1,3)",
        ].map((v) => [{ v }]),
      ],
    },
  ];

  it("answers as over the plain range, the issue's VLOOKUP included", () => {
    const calculated = new SpreadsheetEngine().calculateWorkbook(sheets)[1];
    assert.ok(calculated);
    assert.deepEqual(
      [2, 3, 4, 5, 6, 7].map((row) => cellAt(calculated.data, row, 0)),
      [4, 4, 4, 2, "b", 2],
    );
  });
});

const baseSeed = Number(process.env.ANCHOR_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 200;
const COLUMNS = ["A", "B", "C", "D"];

/** One way of writing a cell: $ before either part, or neither, in either case. */
const writtenCell = (random: Random, column: string, row: number): string => {
  const text = `${random() < 0.5 ? "$" : ""}${column}${random() < 0.5 ? "$" : ""}${row}`;
  return random() < 0.3 ? text.toLowerCase() : text;
};

describe(`a range written every way (seed ${baseSeed})`, () => {
  it("has the bounds of the plain range, and the lookups answer alike", () => {
    const random = seededRandom(baseSeed);
    const data = Array.from({ length: 4 }, (_, row) => COLUMNS.map((_, col) => ({ v: row * 10 + col })));
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const [first, last] = [Math.floor(random() * 2), 2 + Math.floor(random() * 2)];
      const [top, bottom] = [1 + Math.floor(random() * 2), 3 + Math.floor(random() * 2)];
      const [firstColumn, lastColumn] = [COLUMNS[first] ?? "A", COLUMNS[last] ?? "D"];
      const plain = `${firstColumn}${top}:${lastColumn}${bottom}`;
      const written = `${writtenCell(random, firstColumn, top)}:${writtenCell(random, lastColumn, bottom)}`;
      const label = `seed ${baseSeed}: ${written} vs ${plain}`;
      assert.deepEqual(parseRangeBounds(written), parseRangeBounds(plain), label);
      const key = (top - 1) * 10 + first;
      const formulas = (range: string): string[] => [`=VLOOKUP(${key},${range},2,FALSE)`, `=HLOOKUP(${key},${range},2,FALSE)`, `=INDEX(${range},2,2)`];
      const rows = [...data, ...formulas(written).map((v) => [{ v }]), ...formulas(plain).map((v) => [{ v }])];
      const grid = new SpreadsheetEngine().calculate({ name: "S", data: rows } satisfies SheetData).data;
      assert.deepEqual(
        [4, 5, 6].map((row) => cellAt(grid, row, 0)),
        [7, 8, 9].map((row) => cellAt(grid, row, 0)),
        label,
      );
    });
  });
});
