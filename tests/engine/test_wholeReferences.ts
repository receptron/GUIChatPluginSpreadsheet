// Whole-column (`A:A`) and whole-row (`1:1`) references, read as the range they cover in their
// sheet's data. The generated checks confirm that a formula without one is left exactly as
// written, and that one with them answers as the same formula with each range written out by
// hand; rerun one seed with WHOLE_REFERENCES_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { boundWholeReferences, type ExtentOf } from "../../src/engine/wholeReferences.ts";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import type { SpreadsheetCell } from "../../src/engine/types.ts";
import { cellAt } from "./cellAccess.ts";
import { formulaValuesOn } from "./formulaSheet.ts";
import { pick, seededRandom, type Random } from "./seededRandom.ts";

const EXTENTS: Record<string, { rows: number; columns: number }> = {
  "": { rows: 3, columns: 4 },
  Data: { rows: 7, columns: 2 },
  "My Sheet": { rows: 5, columns: 3 },
  "It's": { rows: 2, columns: 1 },
  Empty: { rows: 0, columns: 0 },
};
const extentOf: ExtentOf = (name) => EXTENTS[name ?? ""] ?? null;
const bound = (formula: string): string => boundWholeReferences(formula, extentOf);

describe("boundWholeReferences", () => {
  it("bounds a whole column to the sheet's rows, and a whole row to its columns", () => {
    assert.equal(bound("SUM(A:A)"), "SUM(A1:A3)");
    assert.equal(bound("SUM(B:D)"), "SUM(B1:D3)");
    assert.equal(bound("SUM(1:1)"), "SUM(A1:D1)");
    assert.equal(bound("SUM(2:5)"), "SUM(A2:D5)");
  });

  it("drops the $ anchors, reads lowercase, and puts reversed ends in order", () => {
    assert.equal(bound("SUM($A:$A)"), "SUM(A1:A3)");
    assert.equal(bound("SUM(b:c)"), "SUM(B1:C3)");
    assert.equal(bound("SUM(C:A)"), "SUM(A1:C3)");
    assert.equal(bound("SUM(5:2)"), "SUM(A2:D5)");
    assert.equal(bound("SUM(AB:AA)"), "SUM(AA1:AB3)");
  });

  it("bounds a reference to another sheet by that sheet's data, keeping its prefix", () => {
    assert.equal(bound("SUM(Data!A:A)"), "SUM(Data!A1:A7)");
    assert.equal(bound("SUM('My Sheet'!B:B)"), "SUM('My Sheet'!B1:B5)");
    assert.equal(bound("SUM('It''s'!1:1)"), "SUM('It''s'!A1:A1)");
    assert.equal(bound("SUM(Data!2:2)"), "SUM(Data!A2:B2)");
  });

  it("gives an empty sheet its first row and column", () => {
    assert.equal(bound("SUM(Empty!A:A)"), "SUM(Empty!A1:A1)");
    assert.equal(bound("SUM(Empty!1:1)"), "SUM(Empty!A1:A1)");
  });

  it("bounds every whole reference in the formula", () => {
    assert.equal(bound('SUMIF(A:A,"x",Data!B:B)+SUM(2:2)'), 'SUMIF(A1:A3,"x",Data!B1:B7)+SUM(A2:D2)');
  });

  it("leaves a string literal, a bounded range, a cell and a missing sheet as written", () => {
    ['"A:A"&1', "SUM(A1:B2)", "SUM(Data!A1:A9)", "SUM($A$1:$B$2)", "A1+B2", "SUM(Nope!A:A)", "LOG10(A1)", "IF(A1>0,1,2)", ""].forEach((formula) =>
      assert.equal(bound(formula), formula, formula),
    );
  });

  it("leaves a malformed reference as written, rather than reading part of it", () => {
    ["SUM(A:B1)", "SUM(A1B:C)", "SUM(2:3A)", "SUM(x2:3)", "SUM(A:B(1))", "SUM(A:A:A)", "SUM(foo:A:A)", "SUM(1:1:2)", "SUM(x.1:1)"].forEach((formula) =>
      assert.equal(bound(formula), formula, formula),
    );
  });

  it("leaves the rest of the formula as written after a quote that never closes", () => {
    ['"A:A', 'SUM(1:1)&"A:A', '"say ""A:A'].forEach((formula) => assert.equal(bound(formula), formula.replace("SUM(1:1)", "SUM(A1:D1)"), formula));
  });

  it("reads past a doubled quote inside a literal to the reference after it", () => {
    assert.equal(bound('"say ""A:A"" or 1:1"&B:B'), '"say ""A:A"" or 1:1"&B1:B3');
  });
});

describe("whole references in a sheet", () => {
  const data: SpreadsheetCell[][] = [
    [{ v: 1 }, { v: "a" }, { v: 10 }],
    [{ v: 2 }, { v: "b" }, { v: 20 }],
    [{ v: 3 }, { v: "a" }, { v: 30 }],
  ];

  const valuesOf = (formulas: string[]): unknown[] => formulaValuesOn({ name: "S", data }, formulas);

  it("answers the issue's formulas as Excel does", () => {
    assert.deepEqual(valuesOf(["=SUM(S!A:A)", "=COUNT(S!A:A)", "=SUM(S!1:1)", "=AVERAGE(S!C:C)"]), [6, 3, 11, 20]);
  });

  it("reads them in conditions, lookups and counts", () => {
    assert.deepEqual(
      valuesOf(['=SUMIF(S!B:B,"a",S!C:C)', "=VLOOKUP(2,S!A:C,3,FALSE)", "=MATCH(3,S!A:A,0)", "=INDEX(S!C:C,2)", "=COUNTA(S!B:B)", "=SUM(S!2:3)"]),
      [40, 20, 3, 20, 3, 55],
    );
  });

  it("reads the formula's own sheet, named or not", () => {
    const grid = new SpreadsheetEngine().calculate({
      name: "S",
      data: [[{ v: 1 }, { v: "=SUM(A:A)" }, { v: "=SUM(S!A:A)" }], [{ v: 2 }], [{ v: 3 }]],
    } satisfies SheetData).data;
    assert.deepEqual([cellAt(grid, 0, 1), cellAt(grid, 0, 2)], [6, 6]);
  });

  it("reads a whole row as far as the longest row reaches", () => {
    const grid = new SpreadsheetEngine().calculate({ name: "S", data: [[{ v: "=SUM(2:2)" }], [{ v: 1 }, { v: 2 }, { v: 4 }]] } satisfies SheetData).data;
    assert.equal(cellAt(grid, 0, 0), 7);
  });
});

const baseSeed = Number(process.env.WHOLE_REFERENCES_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 300;

// Pieces of formulas that hold no whole reference, colons in literals and ranges included.
const PLAIN_PIECES = [
  "A1",
  "$B$2",
  "c3",
  "A1:B2",
  "Data!A1:A9",
  "'My Sheet'!B2:C3",
  '"A:A"',
  '"1:1"',
  '"x"',
  "12",
  "3.5",
  "SUM(",
  "LOG10(",
  "IF(",
  ")",
  ",",
  "+",
  "&",
  ">",
  "TRUE",
];

// Whole references on the formula's own sheet (3 rows, 4 columns), and how each is bounded.
const BOUNDED: Record<string, string> = { "A:A": "A1:A3", "B:C": "B1:C3", "$D:$D": "D1:D3", "2:2": "A2:D2", "1:3": "A1:D3" };
const WHOLE_TOKENS = Object.keys(BOUNDED);
// Pieces that cannot form a whole reference with a neighbour, whatever joins them.
const GLUE_SAFE_PIECES = ["A1", "B2", '"x"', "3.5", "LOG10(1)"];
const SEPARATORS = ["+", ",", "&", " ", "*"];
const GLUE = [":", ".", "#"];

describe(`whole references over generated formulas (seed ${baseSeed})`, () => {
  it("leaves a formula without a whole reference exactly as written", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const formula = Array.from({ length: 1 + Math.floor(random() * 8) }, () => pick(random, PLAIN_PIECES)).join("");
      assert.equal(bound(formula), formula, `seed ${baseSeed}: ${formula}`);
    });
  });

  it("rewrites a whole reference exactly when it stands alone as an operand", () => {
    const random = seededRandom(baseSeed + 2);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const tokens = Array.from({ length: 1 + Math.floor(random() * 5) }, () => pick(random, [...WHOLE_TOKENS, ...GLUE_SAFE_PIECES]));
      const joints = tokens.slice(1).map(() => pick(random, [...SEPARATORS, ...GLUE]));
      const formula = `SUM(${tokens.map((token, index) => `${index > 0 ? joints[index - 1] : ""}${token}`).join("")})`;
      const expected = `SUM(${tokens
        .map((token, index) => {
          const standsAlone =
            (index === 0 || SEPARATORS.includes(joints[index - 1] ?? "")) && (index === tokens.length - 1 || SEPARATORS.includes(joints[index] ?? ""));
          const written = standsAlone ? (BOUNDED[token] ?? token) : token;
          return `${index > 0 ? joints[index - 1] : ""}${written}`;
        })
        .join("")})`;
      assert.equal(bound(formula), expected, `seed ${baseSeed}: ${formula}`);
    });
  });

  it("answers as the same formula with each range written out by hand", () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: GENERATED_CASES / 10 }).forEach((_, index) => {
      const rows = 1 + Math.floor(random() * 6);
      const data = Array.from({ length: rows }, () => ["A", "B", "C"].map((): SpreadsheetCell => ({ v: pick(random, [1, 2, 5, -3, 0, "a", ""]) })));
      const cases = Array.from({ length: 8 }, () => handWrittenCase(random, rows));
      const whole = cases.map(([formula]) => formula);
      const written = cases.map(([, formula]) => formula);
      assert.deepEqual(
        formulaValuesOn({ name: "Data", data }, whole),
        formulaValuesOn({ name: "Data", data }, written),
        `seed ${baseSeed} case ${index}: ${whole.join(" ")}`,
      );
    });
  });
});

/** A formula with a whole reference to "Data", and the same formula with the range written out. */
function handWrittenCase(random: Random, rows: number): [string, string] {
  const [first, last] = [pick(random, ["A", "B", "C"]), pick(random, ["A", "B", "C"])].toSorted();
  const row = 1 + Math.floor(random() * rows);
  const pieces: [string, string][] = [
    [`Data!${first}:${last}`, `Data!${first}1:${last}${rows}`],
    [`Data!${row}:${row}`, `Data!A${row}:C${row}`],
  ];
  const [whole, written] = pick(random, pieces);
  const call = pick(random, ["SUM", "COUNT", "COUNTA", "MAX", "AVERAGE"]);
  return [`=${call}(${whole})`, `=${call}(${written})`];
}
