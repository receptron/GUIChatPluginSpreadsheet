// A blank cell, a text cell and a logical cell are not numbers. Read as 0, each
// one silently moves an answer: COUNTIF("<2") counted blanks, AVERAGEIF divided
// by text rows, CORREL paired a blank with the other column's number.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import type { StoredCellValue } from "../../src/engine/types.ts";
import { cellAt } from "./cellAccess.ts";

/** Column A and B hold the data; the formula goes in C1. */
const evaluate = (formula: string, a: StoredCellValue[], b: StoredCellValue[] = []): unknown => {
  const rows = Math.max(a.length, b.length, 1);
  const data: SheetData["data"] = Array.from({ length: rows }, (_, row) => [{ v: a[row] ?? "" }, { v: b[row] ?? "" }, { v: row === 0 ? `=${formula}` : "" }]);
  return cellAt(new SpreadsheetEngine().calculate({ name: "S", data }).data, 0, 2);
};

describe("logical cells in a range are not numbers", () => {
  it("COUNT, SUM and AVERAGE skip TRUE and FALSE", () => {
    assert.equal(evaluate("COUNT(A1:A3)", [true, false, 13]), 1);
    assert.equal(evaluate("SUM(A1:A3)", [true, false, 13]), 13);
    assert.equal(evaluate("AVERAGE(A1:A3)", [true, false, 13]), 13);
  });
});

describe("criteria compare numbers with numbers", () => {
  it("an ordering matches neither a blank nor text", () => {
    assert.equal(evaluate('COUNTIF(A1:A4,"<2")', ["", "x", 1, 5]), 1);
    assert.equal(evaluate('COUNTIF(A1:A4,">=0")', ["", "x", 0, 5]), 2);
  });

  it("a number matches neither a blank nor text that reads as 0", () => {
    assert.equal(evaluate("COUNTIF(A1:A3,0)", ["", "x", 0]), 1);
  });

  it("<> a number matches blanks and text too", () => {
    assert.equal(evaluate('COUNTIF(A1:A4,"<>2")', ["", "x", 2, 3]), 3);
  });

  it("an empty criteria and a bare = match blank cells; a bare <> the others", () => {
    assert.equal(evaluate('COUNTIF(A1:A4,"")', ["", "x", 0, ""]), 2);
    assert.equal(evaluate('COUNTIF(A1:A4,"=")', ["", "x", 0, ""]), 2);
    assert.equal(evaluate('COUNTIF(A1:A4,"<>")', ["", "x", 0, ""]), 2);
  });

  it("a text pattern does not match a number", () => {
    assert.equal(evaluate('COUNTIF(A1:A3,"1*")', [10, "1a", "b"]), 1);
  });

  it("SUMIF and SUMIFS leave out rows whose criteria cell is blank or text", () => {
    assert.equal(evaluate('SUMIF(A1:A3,"<2",B1:B3)', ["", "x", 1], [10, 20, 30]), 30);
    assert.equal(evaluate('SUMIFS(B1:B3,A1:A3,"<2")', ["", "x", 1], [10, 20, 30]), 30);
  });
});

describe("criteria read like the cells they compare", () => {
  it("a formatted number in a criteria is that number", () => {
    assert.equal(evaluate('COUNTIF(A1:A3,">=5%")', [0.04, 0.05, 0.5]), 2);
    assert.equal(evaluate('COUNTIF(A1:A3,"=1,200")', [1, 1200, 12]), 1);
  });

  it("a logical criteria matches logical cells, not the text TRUE", () => {
    assert.equal(evaluate("COUNTIF(A1:A3,TRUE())", [true, "TRUE", false]), 1);
    assert.equal(evaluate("COUNTIF(A1:A3,1=1)", [true, "TRUE", false]), 1);
  });
});

describe("a calculated error in a range is a value, not a blank", () => {
  it("COUNTA counts an error read from another sheet", () => {
    const summary: SheetData = { name: "S", data: [[{ v: "=COUNTA(T!A1:A2)" }]] };
    const source: SheetData = { name: "T", data: [[{ v: "=1/0" }], [{ v: 5 }]] };
    assert.equal(cellAt(new SpreadsheetEngine().calculate(summary, [summary, source]).data, 0, 0), 2);
  });
});

describe("AVERAGEIF averages only the numbers it matched", () => {
  it("skips a blank or text value in the average range", () => {
    assert.equal(evaluate('AVERAGEIF(A1:A4,"=1",B1:B4)', [1, 1, 1, 1], [10, "x", "", 20]), 15);
  });

  it("is #DIV/0! when every matched value is text", () => {
    assert.match(String(evaluate('AVERAGEIF(A1:A2,"=1",B1:B2)', [1, 1], ["x", "y"])), /DIV\/0/);
  });
});

describe("paired functions drop a row with a blank side", () => {
  // Pairs (1,2) and (4,8): the line through them is y = 2x, a perfect fit.
  const xs: StoredCellValue[] = [1, 2, "", 4];
  const ys: StoredCellValue[] = [2, "", 6, 8];
  it("SLOPE, INTERCEPT, CORREL and RSQ see only the complete pairs", () => {
    assert.equal(evaluate("SLOPE(B1:B4,A1:A4)", xs, ys), 2);
    assert.equal(evaluate("INTERCEPT(B1:B4,A1:A4)", xs, ys), 0);
    assert.equal(evaluate("CORREL(A1:A4,B1:B4)", xs, ys), 1);
    assert.equal(evaluate("RSQ(B1:B4,A1:A4)", xs, ys), 1);
  });
});

describe("COUNTA counts what a cell holds, not its blanks", () => {
  it("counts text and numbers, and skips blank cells", () => {
    assert.equal(evaluate("COUNTA(A1:A4)", ["", 5, "x", ""]), 2);
  });
});
