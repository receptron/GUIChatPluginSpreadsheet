// `&` binds looser than + and - (Excel: comparison < & < + - < * / < ^), and it
// joins numbers and booleans as text. Rewriting it to JS `+` in place made
// "a"&1+2 read as ("a"+1)+2 = "a12", and A1&B1 with two numbers add up.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { concatToSum } from "../../src/engine/concatPrecedence.ts";
import { cellAt } from "./cellAccess.ts";

// A1 = 2, B1 = 3, C1 = TRUE (a formula), formula in D1.
const evaluate = (formula: string): unknown => {
  const sheet: SheetData = { name: "S", data: [[{ v: 2 }, { v: 3 }, { v: "=1=1" }, { v: formula }]] };
  return cellAt(new SpreadsheetEngine().calculate(sheet).data, 0, 3);
};

describe("& binds looser than + and -", () => {
  it("computes the arithmetic operand first", () => {
    assert.equal(evaluate('="a"&1+2'), "a3");
    assert.equal(evaluate('="<"&A1+1'), "<3");
    assert.equal(evaluate('=1+2&"a"'), "3a");
    assert.equal(evaluate('="a"&B1-A1'), "a1");
  });

  it("keeps * and / ahead of it as before", () => {
    assert.equal(evaluate('="a"&2*3'), "a6");
    assert.equal(evaluate('="a"&A1/4'), "a0.5");
  });

  it("applies inside parentheses too", () => {
    assert.equal(evaluate('="a"&("b"&1+1)'), "ab2");
    assert.equal(evaluate("=(1)+(2)&(3)"), "33");
  });
});

describe("& joins as text whatever the operands are", () => {
  it("joins two numbers instead of adding them", () => {
    assert.equal(evaluate("=A1&B1"), "23");
    assert.equal(evaluate("=A1&B1&A1"), "232");
  });

  it("writes a boolean as TRUE / FALSE", () => {
    assert.equal(evaluate('=C1&"!"'), "TRUE!");
    assert.equal(evaluate("=A1&C1"), "2TRUE");
  });

  it("writes a boolean in parentheses, or returned by a function, as TRUE / FALSE", () => {
    assert.equal(evaluate("=A1&(C1)"), "2TRUE");
    assert.equal(evaluate("=A1&((C1))"), "2TRUE");
    assert.equal(evaluate("=A1&NOT(1=2)"), "2TRUE");
    assert.equal(evaluate('=AND(1=1,1=2)&"x"'), "FALSEx");
  });

  it("keeps operands whole when a character outside the BMP comes before &", () => {
    const sheet: SheetData = { name: "S", data: [[{ v: "😀" }, { v: '=A1&"!"' }, { v: '="😀"&1+2' }, { v: '=("𝒳"&A1)&"x"' }]] };
    const row = new SpreadsheetEngine().calculate(sheet).data[0];
    assert.deepEqual(row?.slice(1), ["😀!", "😀3", "𝒳😀x"]);
  });

  it("leaves an & inside a literal alone", () => {
    assert.equal(evaluate('="x&y"&"z"'), "x&yz");
  });
});

describe("a comparison with & is not read as addition", () => {
  // Excel compares the joined text "23" with 5, which is FALSE; adding would say TRUE.
  it("does not answer TRUE by adding the operands", () => {
    assert.notEqual(evaluate("=A1&B1=5"), true);
    assert.notEqual(evaluate("=A1&B1=5"), "TRUE");
  });
});

describe("concatToSum", () => {
  it("parenthesises each operand and starts the join from a string", () => {
    assert.equal(concatToSum('"a"&1+2'), '(""+("a")+(1+2))');
  });

  it("returns an expression without & unchanged", () => {
    assert.equal(concatToSum("1+2"), "1+2");
    assert.equal(concatToSum('"a&b"'), '"a&b"');
  });

  it("falls back to the plain rewrite when the expression compares, or an operand is empty", () => {
    assert.equal(concatToSum('"a"&1=1'), '"a"+1=1');
    assert.equal(concatToSum('&"a"'), '+"a"');
  });
});
