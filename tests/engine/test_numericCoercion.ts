// Two numeric reads share one string parser (#2391). `toNumber` stays lenient for
// range aggregation (unreadable → 0, booleans → 0 — PINNED, since changing it
// moves every SUM / AVERAGE / COUNTIF at once). `toScalarNumber` is the strict
// scalar read that ABS / SIGN now use: booleans are Excel's 1/0 and non-numeric
// text is #VALUE! instead of a silent 0.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { holdsNumber, parseNumericString, toScalarNumber } from "../../src/engine/numericCoercion.ts";
import { DIV_ZERO_ERROR, VALUE_ERROR } from "../../src/engine/spreadsheet-errors.ts";
import { toNumber } from "../../src/engine/registry.ts";

describe("parseNumericString — reads the formats the engine has always read", () => {
  it("reads a percentage as its decimal value", () => {
    assert.equal(parseNumericString("5%"), 0.05);
    assert.equal(parseNumericString("100%"), 1);
  });

  it("reads currency and thousands-separated numbers", () => {
    assert.equal(parseNumericString("$1,000"), 1000);
    assert.equal(parseNumericString("$1,000.50"), 1000.5);
    assert.equal(parseNumericString("1,234,567"), 1234567);
  });

  it("reads a plain numeric string, tolerating whitespace and exponents", () => {
    assert.equal(parseNumericString("42"), 42);
    assert.equal(parseNumericString("  42  "), 42);
    assert.equal(parseNumericString("-3.5"), -3.5);
    assert.equal(parseNumericString("1e3"), 1000);
  });

  // Text that only starts with a number is text, as Excel reads a typed cell (#140).
  it("returns null for text that only starts with a number", () => {
    for (const text of ["12abc", "3.5kg", "2023-01", "5% off", "$5 each", "Tokyo, Japan", "1,2,3", "Infinity", "-$-1"]) {
      assert.equal(parseNumericString(text), null, text);
    }
  });

  it("reads a whole number as typed: plain, grouped, percentage, currency", () => {
    const read: [string, number][] = [
      ["42", 42],
      [" 42 ", 42],
      ["-1.5", -1.5],
      [".5", 0.5],
      ["2e3", 2000],
      ["1,200", 1200],
      ["1,200.50", 1200.5],
      ["25%", 0.25],
      ["1,000%", 10],
      ["$1,000", 1000],
      ["-$5", -5],
      ["$-5", -5],
    ];
    for (const [text, number] of read) assert.equal(parseNumericString(text), number, text);
  });

  // The distinction that lets the two coercions differ: null, not 0, when there
  // is no number at all. toNumber maps that to 0; toScalarNumber to #VALUE!.
  it("returns null when nothing parses", () => {
    assert.equal(parseNumericString("abc"), null);
    assert.equal(parseNumericString(""), null);
    assert.equal(parseNumericString("   "), null);
    assert.equal(parseNumericString("N/A"), null);
    assert.equal(parseNumericString("abc12"), null);
  });
});

describe("toNumber — PINNED lenient behaviour (#2391 does not change this)", () => {
  it("returns a number unchanged", () => {
    assert.equal(toNumber(42), 42);
    assert.equal(toNumber(0), 0);
    assert.equal(toNumber(-7.5), -7.5);
  });

  it("maps unreadable text to 0", () => {
    assert.equal(toNumber("hello"), 0);
    assert.equal(toNumber(""), 0);
    assert.equal(toNumber("N/A"), 0);
  });

  // The high-blast-radius case the issue asked to pin: booleans read as 0 here,
  // NOT Excel's 1/0, because SUM / AVERAGE / COUNTIF all lean on this.
  it("maps booleans to 0, not Excel's 1 and 0", () => {
    assert.equal(toNumber(true), 0);
    assert.equal(toNumber(false), 0);
  });

  it("still reads formatted strings", () => {
    assert.equal(toNumber("5%"), 0.05);
    assert.equal(toNumber("$1,000"), 1000);
    assert.equal(toNumber("12abc"), 0);
  });
});

describe("toScalarNumber — strict scalar read for ABS / SIGN (#2391)", () => {
  it("returns a number unchanged", () => {
    assert.equal(toScalarNumber(42), 42);
    assert.equal(toScalarNumber(-7.5), -7.5);
    assert.equal(toScalarNumber(0), 0);
  });

  // The boolean fix: TRUE=1, FALSE=0 (Excel), where toNumber gives 0 for both.
  it("reads booleans as Excel's 1 and 0", () => {
    assert.equal(toScalarNumber(true), 1);
    assert.equal(toScalarNumber(false), 0);
  });

  it("parses numeric and formatted text", () => {
    assert.equal(toScalarNumber("5"), 5);
    assert.equal(toScalarNumber("$1,000"), 1000);
    assert.equal(toScalarNumber("50%"), 0.5);
  });

  // The text fix: genuinely non-numeric text is an error, not a silent 0.
  it("returns #VALUE! for non-numeric text and empty strings", () => {
    assert.equal(toScalarNumber("abc"), VALUE_ERROR);
    assert.equal(toScalarNumber(""), VALUE_ERROR);
    assert.equal(toScalarNumber("   "), VALUE_ERROR);
  });

  it("is #VALUE! for text that only starts with a number, as in Excel (#140)", () => {
    assert.equal(toScalarNumber("12abc"), VALUE_ERROR);
  });
});

// The question `toNumber` cannot answer: it maps text, booleans and a genuine 0
// to the same 0, so COUNT could not tell "no number here" from "the number zero"
// and counted COUNT("text") as a value (Codex review on #2360).
describe("holdsNumber — is there a number in this value at all", () => {
  it("is true for numbers, including zero and negatives", () => {
    assert.equal(holdsNumber(42), true);
    assert.equal(holdsNumber(0), true);
    assert.equal(holdsNumber(-7.5), true);
  });

  it("is true for text the engine reads as a number", () => {
    assert.equal(holdsNumber("1"), true);
    assert.equal(holdsNumber("  42  "), true);
    assert.equal(holdsNumber("5%"), true);
    assert.equal(holdsNumber("$1,000"), true);
  });

  it("is false for text holding no number", () => {
    assert.equal(holdsNumber("text"), false);
    assert.equal(holdsNumber(""), false);
    assert.equal(holdsNumber("   "), false);
    assert.equal(holdsNumber("N/A"), false);
    assert.equal(holdsNumber("abc12"), false);
  });

  // Same PINNED stance as toNumber: a boolean is not a number in this engine.
  it("is false for booleans", () => {
    assert.equal(holdsNumber(true), false);
    assert.equal(holdsNumber(false), false);
  });

  it("is false for a formula error value", () => {
    assert.equal(holdsNumber(DIV_ZERO_ERROR), false);
  });

  it("is false for NaN, which is a number that is no number", () => {
    assert.equal(holdsNumber(NaN), false);
  });

  it("is false for text that only starts with a number, as in Excel (#140)", () => {
    assert.equal(holdsNumber("12abc"), false);
  });
});
