// A criteria argument is an expression like any other: a literal (">=2"), a
// cell (C1) or a concatenation (">="&C1). It used to be read as source text, so
// C1 was matched against the letters "C1" and the function answered a silent 0.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { cellAt } from "./cellAccess.ts";

// A = numbers, B = labels, C1 = a threshold, formula in D1.
const evaluate = (formula: string): unknown => {
  const sheet: SheetData = {
    name: "S",
    data: [
      [{ v: 1 }, { v: "x" }, { v: 2 }, { v: formula }],
      [{ v: 2 }, { v: "y" }],
      [{ v: 3 }, { v: "x" }],
    ],
  };
  return cellAt(new SpreadsheetEngine().calculate(sheet).data, 0, 3);
};

describe("criteria held in a cell", () => {
  it("matches the cell's number", () => {
    assert.equal(evaluate("=COUNTIF(A1:A3,C1)"), 1);
  });

  it("matches the cell's text", () => {
    assert.equal(evaluate("=COUNTIF(B1:B3,B1)"), 2);
    assert.equal(evaluate("=SUMIF(B1:B3,B1,A1:A3)"), 4);
    assert.equal(evaluate("=AVERAGEIF(B1:B3,B1,A1:A3)"), 2);
    assert.equal(evaluate("=SUMIFS(A1:A3,B1:B3,B3)"), 4);
  });
});

describe("criteria built with &", () => {
  it("compares against the concatenated threshold", () => {
    assert.equal(evaluate('=COUNTIF(A1:A3,">="&C1)'), 2);
    assert.equal(evaluate('=SUMIF(A1:A3,">="&C1)'), 5);
    assert.equal(evaluate('=COUNTIFS(A1:A3,">="&C1,B1:B3,"x")'), 1);
    assert.equal(evaluate('=AVERAGEIFS(A1:A3,A1:A3,"<"&C1)'), 1);
  });
});

describe("criteria written as a literal still work", () => {
  it("comparisons, text and wildcards", () => {
    assert.equal(evaluate('=COUNTIF(A1:A3,">=2")'), 2);
    assert.equal(evaluate('=COUNTIF(B1:B3,"x")'), 2);
    assert.equal(evaluate('=COUNTIF(B1:B3,"X")'), 2);
    assert.equal(evaluate('=COUNTIF(B1:B3,"<>x")'), 1);
    assert.equal(evaluate('=COUNTIF(B1:B3,"?")'), 3);
    assert.equal(evaluate('=COUNTIFS(A1:A3,">1",A1:A3,"<3")'), 1);
  });
});

describe("a criteria that evaluates to an error", () => {
  it("propagates the error instead of counting nothing", () => {
    [
      "=COUNTIF(A1:A3,1/0)",
      "=SUMIF(A1:A3,1/0)",
      "=AVERAGEIF(A1:A3,1/0)",
      "=COUNTIFS(A1:A3,1/0)",
      "=SUMIFS(A1:A3,A1:A3,1/0)",
      "=AVERAGEIFS(A1:A3,A1:A3,1/0)",
    ].forEach((formula) => assert.equal(evaluate(formula), "#DIV/0!", formula));
  });
});
