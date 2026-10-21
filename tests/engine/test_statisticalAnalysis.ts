// The analysis functions read through a real sheet: the ranges are read raw so
// two columns stay paired by row, and the multi-condition aggregates keep their
// ranges row-aligned the way SUMIF does.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { functionRegistry } from "../../src/engine/functions/index.ts";
import { cellAt } from "./cellAccess.ts";
import { assertWithin } from "./closeness.ts";

const TOLERANCE = 1e-6;

// Region, units, price — with a blank price in row 4 and a text price in row 5.
const ROWS: (string | number)[][] = [
  ["East", 1, 10],
  ["West", 2, 20],
  ["East", 3, 30],
  ["East", 4, ""],
  ["West", 5, "n/a"],
  ["East", 6, 60],
];

/** The data in A1:C6 with `formula` in E1, calculated. */
const evaluate = (formula: string): unknown => {
  const data = ROWS.map((row, index) => row.map((v) => ({ v })).concat([{ v: "" }, { v: index === 0 ? formula : "" }]));
  const sheet: SheetData = { name: "S", data };
  return cellAt(new SpreadsheetEngine().calculate(sheet).data, 0, 4);
};

const assertClose = (actual: unknown, expected: number): void => assertWithin(actual, expected, TOLERANCE);

describe("analysis functions are registered as Statistical", () => {
  it("each name is callable", () => {
    const names = [
      "CORREL",
      "SLOPE",
      "INTERCEPT",
      "RSQ",
      "PERCENTILE",
      "QUARTILE",
      "LARGE",
      "SMALL",
      "RANK",
      "STDEVP",
      "VARP",
      "SUMIFS",
      "COUNTIFS",
      "AVERAGEIFS",
    ];
    names.forEach((name) => assert.equal(functionRegistry.get(name)?.category, "Statistical", name));
  });
});

describe("paired functions skip a row with no number on either side", () => {
  // Rows 1, 2, 3 and 6 pair (1,10) (2,20) (3,30) (6,60): price = 10 * units.
  it("CORREL, SLOPE, INTERCEPT, RSQ", () => {
    assertClose(evaluate("=CORREL(C1:C6, B1:B6)"), 1);
    assertClose(evaluate("=SLOPE(C1:C6, B1:B6)"), 10);
    assertClose(evaluate("=INTERCEPT(C1:C6, B1:B6)"), 0);
    assertClose(evaluate("=RSQ(C1:C6, B1:B6)"), 1);
  });

  it("answers #N/A for ranges of different sizes", () => {
    assert.equal(evaluate("=CORREL(C1:C6, B1:B5)"), "#N/A");
  });

  it("answers #DIV/0! when fewer than two rows pair", () => {
    assert.equal(evaluate("=SLOPE(C4:C5, B4:B5)"), "#DIV/0!");
  });
});

describe("ranked functions read the numbers of one range", () => {
  it("PERCENTILE and QUARTILE interpolate like the .INC versions", () => {
    assertClose(evaluate("=PERCENTILE(B1:B6, 0.25)"), 2.25);
    assertClose(evaluate("=QUARTILE(B1:B4, 3)"), 3.25);
  });

  it("LARGE and SMALL skip the blank and the text", () => {
    assert.equal(evaluate("=LARGE(C1:C6, 1)"), 60);
    assert.equal(evaluate("=SMALL(C1:C6, 4)"), 60);
    assert.equal(evaluate("=LARGE(C1:C6, 5)"), "#NUM!");
  });

  it("k may be a cell reference or an expression", () => {
    assert.equal(evaluate("=LARGE(B1:B6, B2)"), 5);
    assert.equal(evaluate("=SMALL(B1:B6, 1+2)"), 3);
  });

  it("a k that is text is #VALUE!", () => {
    assert.equal(evaluate("=LARGE(B1:B6, A1)"), "#VALUE!");
  });

  it("RANK is largest first unless order is non-zero", () => {
    assert.equal(evaluate("=RANK(B3, B1:B6)"), 4);
    assert.equal(evaluate("=RANK(B3, B1:B6, 1)"), 3);
    assert.equal(evaluate("=RANK(99, B1:B6)"), "#N/A");
  });

  it("STDEVP and VARP divide by n", () => {
    assertClose(evaluate("=VARP(B1:B6)"), 35 / 12);
    assertClose(evaluate("=STDEVP(B1:B6)"), Math.sqrt(35 / 12));
  });
});

describe("multi-condition aggregates", () => {
  it("SUMIFS sums the rows meeting every condition", () => {
    assert.equal(evaluate('=SUMIFS(B1:B6, A1:A6, "East")'), 14);
    assert.equal(evaluate('=SUMIFS(B1:B6, A1:A6, "East", B1:B6, ">2")'), 13);
  });

  it("SUMIFS reads a matched blank or text cell as 0", () => {
    assert.equal(evaluate('=SUMIFS(C1:C6, A1:A6, "East")'), 100);
  });

  it("COUNTIFS counts the rows meeting every condition", () => {
    assert.equal(evaluate('=COUNTIFS(A1:A6, "East")'), 4);
    assert.equal(evaluate('=COUNTIFS(A1:A6, "east", B1:B6, "<4")'), 2);
  });

  it("AVERAGEIFS leaves out a matched cell with no number", () => {
    assertClose(evaluate('=AVERAGEIFS(C1:C6, A1:A6, "East")'), 100 / 3);
  });

  it("AVERAGEIFS is #DIV/0! when no row matches", () => {
    assert.equal(evaluate('=AVERAGEIFS(C1:C6, A1:A6, "North")'), "#DIV/0!");
  });

  it("a range of another size is #VALUE!", () => {
    assert.equal(evaluate('=SUMIFS(B1:B6, A1:A5, "East")'), "#VALUE!");
    assert.equal(evaluate('=COUNTIFS(A1:A6, "East", B1:B5, ">0")'), "#VALUE!");
  });

  it("a range without its criteria is an error, not a silent answer", () => {
    const result = evaluate('=SUMIFS(B1:B6, A1:A6, "East", B1:B6)');
    assert.equal(typeof result, "string");
    assert.match(String(result), /^#/);
  });
});
