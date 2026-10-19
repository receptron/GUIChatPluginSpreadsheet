// A reference to a blank cell, as a text function's argument or alone on one side of a comparison,
// reads as Excel reads it: "" in a text function, and in a comparison whatever the other side is —
// 0 beside a number, "" beside text, FALSE beside a logical value. On its own (`=A1`) and in
// arithmetic it stays 0. The generated checks put the blank beside every kind of value and compare
// with the literal Excel reads it as; rerun one seed with BLANK_ARGS_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { blankBeside, withBlankSides } from "../../src/engine/blankOperands.ts";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import type { SpreadsheetCell } from "../../src/engine/types.ts";
import { cellAt } from "./cellAccess.ts";
import { pick, seededRandom } from "./seededRandom.ts";

// A1 is blank, A2 holds 0, A3 holds "x", A4 is a {} cell; the formulas go in column B.
const DATA: SpreadsheetCell[] = [{ v: "" }, { v: 0 }, { v: "x" }, {}];

function valuesOf(formulas: string[]): unknown[] {
  const rows = Array.from({ length: Math.max(DATA.length, formulas.length) }, (_, row) => [DATA[row] ?? { v: "" }, { v: formulas[row] ?? "" }]);
  const grid = new SpreadsheetEngine().calculate({ name: "S", data: rows } satisfies SheetData).data;
  return formulas.map((_, row) => cellAt(grid, row, 1));
}

describe("blankBeside and withBlankSides", () => {
  it('reads a blank as 0 beside a number, FALSE beside a logical value, and "" otherwise', () => {
    assert.equal(blankBeside(5), 0);
    assert.equal(blankBeside(true), false);
    assert.equal(blankBeside("a"), "");
    assert.equal(blankBeside(""), "");
  });

  it("reads each blank side beside its neighbour, and a later side of a chain beside a logical value", () => {
    assert.deepEqual(withBlankSides([0, "a"], [true, false]), ["", "a"]);
    assert.deepEqual(withBlankSides([7, 0], [false, true]), [7, 0]);
    assert.deepEqual(withBlankSides([1, 1, 0], [false, false, true]), [1, 1, false]);
  });
});

describe("a blank cell", () => {
  it("answers the issue's formulas as Excel does", () => {
    assert.deepEqual(valuesOf(['=CONCATENATE(A1,"x")', '=CONCAT(A1,"x")', "=LEN(A1)", '=A1=""', '=IF(A1="","e","n")']), ["x", "x", 0, true, "e"]);
  });

  it('compares as 0 beside a number, FALSE beside a logical value and "" beside text', () => {
    assert.deepEqual(valuesOf(["=A1=0", "=A1<1", "=A1=FALSE", '=A1>"a"', '=""=A1', '=(A1)=""', '=A1<>""']), [true, true, true, false, true, true, false]);
  });

  it("is a {} cell as well", () => {
    assert.deepEqual(valuesOf(["=A4=0", '=A4=""', "=LEN(A4)", '=CONCATENATE(A4,"x")', "=A4=A1"]), [true, true, 0, "x", true]);
  });

  it("compares equal to another blank cell", () => {
    assert.deepEqual(valuesOf(["=A1=A1", "=A1<>A1"]), [true, false]);
  });

  it('is "" in a text function', () => {
    assert.deepEqual(valuesOf(['=UPPER(A1)&"|"', "=LEFT(A1,2)", '=EXACT(A1,"")', '=SUBSTITUTE(A1,"a","b")', '=TRIM(A1)&"|"']), ["|", "", true, "", "|"]);
  });

  it("stays 0 on its own, in arithmetic, and where a number is read", () => {
    assert.deepEqual(valuesOf(["=A1", "=A1+1", "=VALUE(A1)", "=SUM(A1,1)", "=ROUND(A1,0)"]), [0, 1, 0, 1, 0]);
  });

  it("is told apart from a cell holding 0 or text", () => {
    assert.deepEqual(valuesOf(['=A2=""', "=A2=0", "=LEN(A2)", '=A3=""', "=LEN(A3)"]), [false, true, 1, false, 1]);
  });

  it("is a reference alone, not one inside a larger operand", () => {
    assert.deepEqual(valuesOf(['=A1+0=""', '=(A1&"")=""']), [false, true]);
  });
});

const baseSeed = Number(process.env.BLANK_ARGS_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 300;
// Each other side, and the literal a blank beside it reads as.
const OTHERS: [string, string][] = [
  ["0", "0"],
  ["1", "0"],
  ["-1", "0"],
  ["0.5", "0"],
  ['"a"', '""'],
  ['""', '""'],
  ['"0"', '""'],
  ["TRUE", "FALSE"],
  ["FALSE", "FALSE"],
];
const OPERATORS = ["=", "<>", "<", ">", "<=", ">="];
const TEXT_FUNCTIONS: ((x: string) => string)[] = [
  (x) => `=LEN(${x})`,
  (x) => `=UPPER(${x})&"|"`,
  (x) => `=CONCATENATE(${x},"x")`,
  (x) => `=CONCAT("x",${x})`,
  (x) => `=LEFT(${x},1)&"|"`,
  (x) => `=EXACT(${x},"")`,
  (x) => `=TRIM(${x})&"|"`,
];

describe(`a blank beside every kind of value (seed ${baseSeed})`, () => {
  it("compares as the literal Excel reads it as", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const [other, asLiteral] = pick(random, OTHERS);
      const operator = pick(random, OPERATORS);
      const blankFirst = random() < 0.5;
      const formula = (blank: string): string => (blankFirst ? `=${blank}${operator}${other}` : `=${other}${operator}${blank}`);
      const [read, expected] = valuesOf([formula("A1"), formula(asLiteral)]);
      assert.deepEqual(read, expected, `seed ${baseSeed}: ${formula("A1")} vs ${formula(asLiteral)}`);
    });
  });

  it('is "" in a text function', () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: GENERATED_CASES / 10 }).forEach(() => {
      const textFunction = pick(random, TEXT_FUNCTIONS);
      const [read, expected] = valuesOf([textFunction("A1"), textFunction('""')]);
      assert.deepEqual(read, expected, `seed ${baseSeed}: ${textFunction("A1")}`);
    });
  });
});
