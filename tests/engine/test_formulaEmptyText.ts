// A cell whose formula answers "" or text reads as that answer, whether the formula reading it is
// calculated before or after it: a formula cell is never a blank cell, and its "" is text.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type CellValue } from "../../src/engine/index.ts";

const READERS = ["=X<1", "=X=0", '=X=""', "=X+1", '=X&"x"', "=LEN(X)", "=COUNTA(X)", '=IF(X="","empty","not")', '=Y&"x"', "=Z", "=Z*2"];

/** Each reader's answer with X = `=""`, Y = `=" "` and Z = `="1,200"` written above the readers, or below them. */
function answers(placement: "above" | "below"): CellValue[] {
  const sourceRow = placement === "above" ? 1 : READERS.length + 1;
  const sources = [{ v: '=""' }, { v: '=" "' }, { v: '="1,200"' }];
  const readers = READERS.map((formula) => [{ v: formula.replaceAll("X", `A${sourceRow}`).replaceAll("Y", `B${sourceRow}`).replaceAll("Z", `C${sourceRow}`) }]);
  const data = placement === "above" ? [sources, ...readers] : [...readers, sources];
  const grid = new SpreadsheetEngine().calculate({ name: "S", data }).data;
  const firstReader = placement === "above" ? 1 : 0;
  return READERS.map((_, index) => grid[firstReader + index]?.[0] ?? null);
}

describe("a formula's empty text and text", () => {
  it("reads as Excel reads it", () => {
    assert.deepEqual(answers("above"), [false, false, true, "#VALUE!", "x", 0, 1, "empty", " x", "1,200", 2400]);
  });

  it("reads the same whether the formula was calculated before or after its reader", () => {
    assert.deepEqual(answers("below"), answers("above"));
  });
});
