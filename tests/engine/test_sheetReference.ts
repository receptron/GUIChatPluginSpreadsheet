// A sheet name with an apostrophe is written quoted with the apostrophe doubled: 'It''s'!A1
// names the sheet It's. The generated check confirms that every reference without a doubled
// apostrophe splits exactly as the pattern used before; rerun one seed with SHEET_REF_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { endOfQuotedSheetName, splitSheetReference } from "../../src/engine/sheetReference.ts";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { cellAt } from "./cellAccess.ts";
import { pick, seededRandom } from "./seededRandom.ts";

describe("splitSheetReference", () => {
  it("splits a plain or quoted sheet name from the reference", () => {
    assert.deepEqual(splitSheetReference("Data!A1"), { sheetName: "Data", ref: "A1" });
    assert.deepEqual(splitSheetReference("'My Sheet'!A1:B2"), { sheetName: "My Sheet", ref: "A1:B2" });
  });

  it("reads a doubled apostrophe in a quoted name as one", () => {
    assert.deepEqual(splitSheetReference("'It''s'!A1"), { sheetName: "It's", ref: "A1" });
    assert.deepEqual(splitSheetReference("'''Quoted'''!B2"), { sheetName: "'Quoted'", ref: "B2" });
  });

  it("is null for a reference without a sheet", () => {
    assert.equal(splitSheetReference("A1"), null);
    assert.equal(splitSheetReference("A1:B2"), null);
  });
});

describe("endOfQuotedSheetName", () => {
  it("finds the quote that closes the name, past doubled ones", () => {
    assert.equal(endOfQuotedSheetName("'Data'!A1", 0), 6);
    assert.equal(endOfQuotedSheetName("'It''s'!A1", 0), 7);
    assert.equal(endOfQuotedSheetName("x+'It''s'!A1", 2), 9);
  });

  it("is -1 for a name that never closes", () => {
    assert.equal(endOfQuotedSheetName("'Data!A1", 0), -1);
    assert.equal(endOfQuotedSheetName("'It''", 0), -1);
  });
});

describe("a sheet named with an apostrophe", () => {
  const sheets: SheetData[] = [
    {
      name: "It's",
      data: [
        [{ v: 1 }, { v: 10 }],
        [{ v: 2 }, { v: 20 }],
      ],
    },
    {
      name: "F",
      data: ["=SUM('It''s'!A1:A2)", "='It''s'!A1+1", "=VLOOKUP(2,'It''s'!A1:B2,2,FALSE)", "=COUNTA('It''s'!A1:A2)", "='It''s'!B2"].map((v) => [{ v }]),
    },
  ];

  it("answers the issue's formulas as Excel does", () => {
    const calculated = new SpreadsheetEngine().calculateWorkbook(sheets)[1];
    assert.ok(calculated);
    assert.deepEqual(
      [0, 1, 2, 3, 4].map((row) => cellAt(calculated.data, row, 0)),
      [3, 2, 20, 2, 20],
    );
  });
});

// The pattern the calculator used before: a quoted name could hold no apostrophe at all.
const PATTERN_BEFORE = /^(?:'([^']+)'|([^!]+))!(.+)$/;
const splitBefore = (ref: string): { sheetName: string; ref: string } | null => {
  const [, quoted, plain, inner] = ref.match(PATTERN_BEFORE) ?? [];
  const sheetName = quoted ?? plain;
  return sheetName === undefined || inner === undefined ? null : { sheetName, ref: inner };
};

const baseSeed = Number(process.env.SHEET_REF_SEED ?? Date.now() % 1_000_000);
const PIECES = ["Data", "My Sheet", "'", "!", "A1", ":", "B2", "x", " ", "$A$1", "Q1", "''"];

describe(`references without a doubled apostrophe (seed ${baseSeed})`, () => {
  it("split exactly as before", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: 2000 }).forEach(() => {
      const ref = Array.from({ length: 1 + Math.floor(random() * 6) }, () => pick(random, PIECES)).join("");
      if (ref.includes("''")) return;
      assert.deepEqual(splitSheetReference(ref), splitBefore(ref), `seed ${baseSeed}: ${ref}`);
    });
  });
});
