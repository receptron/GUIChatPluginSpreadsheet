// A quote is escaped only when an ODD run of backslashes precedes it. Looking at
// one character back read the closing quote of `"a\\"` as escaped.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isEscapedAt } from "../../src/engine/escapes.ts";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { cellAt } from "./cellAccess.ts";

describe("isEscapedAt", () => {
  it("counts the run of backslashes before the character", () => {
    assert.equal(isEscapedAt('a"', 1), false);
    assert.equal(isEscapedAt('a\\"', 2), true);
    assert.equal(isEscapedAt('a\\\\"', 3), false);
    assert.equal(isEscapedAt('a\\\\\\"', 4), true);
  });

  it("is false at the start of the text", () => {
    assert.equal(isEscapedAt('"', 0), false);
  });
});

// A1 holds the text under test, formula in B1.
const evaluate = (a1: string, formula: string): unknown => {
  const sheet: SheetData = { name: "S", data: [[{ v: a1 }, { v: formula }]] };
  return cellAt(new SpreadsheetEngine().calculate(sheet).data, 0, 1);
};

describe("text ending in a backslash, or holding a quote, through the engine", () => {
  it("joins a cell value ending in a backslash", () => {
    assert.equal(evaluate("a\\", '=A1&"!"'), "a\\!");
    assert.equal(evaluate("a\\", '=LEN(A1&"!")'), 3);
  });

  it("joins a function result ending in a backslash or holding a quote", () => {
    assert.equal(evaluate("a\\", '=UPPER(A1)&"!"'), "A\\!");
    assert.equal(evaluate('say "hi"', '=UPPER(A1)&"!"'), 'SAY "HI"!');
    assert.equal(evaluate('a"b', '=LEFT(A1,2)&"|"'), 'a"|');
  });
});
