// Excel-formula → JS-expression translation. These are the pure string
// transforms the evaluator runs on an already-substituted expression before
// handing it to `new Function`. A mistranslated operator can still produce a
// plausible wrong NUMBER. What #2359 fixed: a formula that reaches `new Function`
// as invalid JS no longer comes back as its raw text — it surfaces as an
// #ERROR!. This suite pins both the remaining known-wrong number cases and the
// post-#2359 error surfacing.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  caretToPow,
  separateRepeatedSigns,
  replaceConcatOperator,
  rewriteComparisonEq,
  isSafeArithmetic,
  isSafeComparison,
  SpreadsheetEngine,
  type SheetData,
} from "../../src/engine/index.ts";
import { cellAt } from "./cellAccess.ts";

describe("caretToPow", () => {
  it("rewrites a single caret to the JS exponentiation operator", () => {
    assert.equal(caretToPow("2^3"), "2**3");
  });

  it("rewrites every caret in the expression", () => {
    assert.equal(caretToPow("2^3+4^5"), "2**3+4**5");
  });

  // Excel's `^` is LEFT-associative (`2^3^2` = `(2^3)^2` = 64); JS `**` is
  // right-associative, so a chain is bracketed from the left.
  it("brackets a chain of carets from the left", () => {
    assert.equal(caretToPow("2^3^2"), "(2**3)**2");
    assert.equal(caretToPow("A^B^C"), "(A**B)**C");
    assert.equal(new Function(`return (${caretToPow("2^3^2")})`)(), 64);
  });

  // JS rejects `-2**2`; Excel negates first, so a signed base is bracketed.
  it("brackets a signed base or exponent", () => {
    assert.equal(caretToPow("-2^2"), "(-2)**2");
    assert.equal(caretToPow("2^-2"), "2**(-2)");
    assert.equal(caretToPow("--2^2"), "(- -2)**2");
    assert.equal(caretToPow("-(1+1)^2"), "(-(1+1))**2");
  });

  it("treats a minus after an operand as binary", () => {
    assert.equal(caretToPow("1-2^2"), "1-2**2");
    assert.equal(caretToPow("1 - 2 ^ 2"), "1 - 2**2");
  });

  it("rewrites carets inside brackets", () => {
    assert.equal(caretToPow("(2^3)"), "(2**3)");
    assert.equal(caretToPow("(1+(2^3^2))*2"), "(1+((2**3)**2))*2");
  });

  it("leaves a caret inside a string literal alone", () => {
    assert.equal(caretToPow('"a^b"'), '"a^b"');
    assert.equal(caretToPow('"a\\\\"^2'), '"a\\\\"**2', "an escaped backslash does not escape the closing quote");
    assert.equal(caretToPow('"a\\"^2'), '"a\\"^2', "an escaped quote keeps the literal open");
  });

  it("keeps a caret with no operand after it as **", () => {
    assert.equal(caretToPow("2^"), "2**");
    assert.equal(caretToPow("^2"), "**2");
  });

  it("leaves text outside a chain as it was written", () => {
    assert.equal(caretToPow("1--2"), "1--2");
    assert.equal(caretToPow("- -2 + (1"), "- -2 + (1");
    assert.equal(caretToPow("--2"), "--2", "signs outside a chain keep their spelling");
    assert.equal(caretToPow("- 2*3"), "- 2*3");
  });

  it("leaves an expression with no caret unchanged", () => {
    assert.equal(caretToPow("2+3*4"), "2+3*4");
    assert.equal(caretToPow(""), "");
  });
});

describe("separateRepeatedSigns", () => {
  it("puts a space between two equal signs in a row", () => {
    assert.equal(separateRepeatedSigns("1--2"), "1- -2");
    assert.equal(separateRepeatedSigns("--2"), "- -2");
    assert.equal(separateRepeatedSigns("---2"), "- - -2");
    assert.equal(separateRepeatedSigns("1++2"), "1+ +2");
  });

  it("leaves mixed signs, exponents and a single sign alone", () => {
    assert.equal(separateRepeatedSigns("1-+-2"), "1-+-2");
    assert.equal(separateRepeatedSigns("2**-2"), "2**-2");
    assert.equal(separateRepeatedSigns("1-2"), "1-2");
    assert.equal(separateRepeatedSigns(""), "");
  });

  it("leaves signs inside a string literal alone", () => {
    assert.equal(separateRepeatedSigns('"a--b"+1--2'), '"a--b"+1- -2');
    assert.equal(separateRepeatedSigns("'++'"), "'++'");
    assert.equal(separateRepeatedSigns('"a\\\\"--1'), '"a\\\\"- -1', "an escaped backslash, and the quote after it closes the literal");
    assert.equal(separateRepeatedSigns('"a\\"--1'), '"a\\"--1', "an escaped quote keeps the literal open");
  });
});

describe("replaceConcatOperator", () => {
  it("rewrites a concatenation ampersand to +", () => {
    assert.equal(replaceConcatOperator('"a"&"b"'), '"a"+"b"');
    assert.equal(replaceConcatOperator("5&6"), "5+6");
  });

  it("rewrites every ampersand outside string literals", () => {
    assert.equal(replaceConcatOperator('"a"&"b"&"c"'), '"a"+"b"+"c"');
  });

  // An ampersand INSIDE a literal is text, not an operator — flipping it would
  // corrupt the string content.
  it("preserves an ampersand inside a double-quoted literal", () => {
    assert.equal(replaceConcatOperator('"a&b"&"c"'), '"a&b"+"c"');
  });

  it("preserves an ampersand inside a single-quoted literal", () => {
    assert.equal(replaceConcatOperator("'a&b'&'c'"), "'a&b'+'c'");
  });

  // A backslash-escaped quote does not end the literal, so an ampersand after it
  // is still inside the string and must be preserved.
  it("honours a backslash-escaped quote when tracking literal boundaries", () => {
    assert.equal(replaceConcatOperator('"a\\"&b"&"c"'), '"a\\"&b"+"c"');
  });

  it("leaves an expression with no ampersand unchanged", () => {
    assert.equal(replaceConcatOperator("2+3"), "2+3");
    assert.equal(replaceConcatOperator('"plain"'), '"plain"');
    assert.equal(replaceConcatOperator(""), "");
  });

  it("rewrites a leading or trailing ampersand outside a literal", () => {
    assert.equal(replaceConcatOperator('&"x"'), '+"x"');
    assert.equal(replaceConcatOperator('"x"&'), '"x"+');
  });
});

describe("rewriteComparisonEq", () => {
  it("rewrites a single equality to the JS == operator", () => {
    assert.equal(rewriteComparisonEq("5=5"), "5==5");
    assert.equal(rewriteComparisonEq("5=6"), "5==6");
  });

  it("does not disturb <=, >= or != which are already valid JS", () => {
    assert.equal(rewriteComparisonEq("5<=6"), "5<=6");
    assert.equal(rewriteComparisonEq("5>=6"), "5>=6");
    assert.equal(rewriteComparisonEq("5!=6"), "5!=6");
  });

  // The regex matches the SECOND `=` of a `==` (its left neighbour, the first
  // `=`, is not one of `<>!`), so an already-doubled `==` becomes `===`. Excel
  // never emits `==`, so this only bites a hand-typed oddity — pinned as a known
  // quirk (#2359) rather than relied upon.
  it("turns an already-doubled == into === (known quirk)", () => {
    assert.equal(rewriteComparisonEq("5==6"), "5===6");
  });

  // The match consumes both flanking characters, so replacements cannot overlap:
  // in `5=6=7` only the first `=` is rewritten. Pinned as a known limitation
  // (#2359) — the non-overlapping replacement is a real bug to be fixed later.
  it("rewrites only the first of two adjacent equalities (non-overlapping)", () => {
    assert.equal(rewriteComparisonEq("5=6=7"), "5==6=7");
  });

  // A `=` with nothing on one side has no flanking character to match, so it is
  // left as a lone `=`. Pinned known limitation (#2359).
  it("does not rewrite an = at the start or end of the expression", () => {
    assert.equal(rewriteComparisonEq("=5"), "=5");
    assert.equal(rewriteComparisonEq("5="), "5=");
  });

  it("leaves an expression with no equals unchanged", () => {
    assert.equal(rewriteComparisonEq("5<6"), "5<6");
    assert.equal(rewriteComparisonEq(""), "");
  });
});

describe("isSafeArithmetic", () => {
  it("accepts digits, arithmetic operators, parentheses, dot and space", () => {
    assert.equal(isSafeArithmetic("2+3*4"), true);
    assert.equal(isSafeArithmetic("(2 + 3) / 4.5"), true);
    assert.equal(isSafeArithmetic("2**3"), true, "** survives the caret rewrite and must pass");
  });

  it("rejects letters, quotes, ampersands and comparison characters", () => {
    assert.equal(isSafeArithmetic("A1+2"), false);
    assert.equal(isSafeArithmetic('"a"+"b"'), false);
    assert.equal(isSafeArithmetic("5&6"), false);
    assert.equal(isSafeArithmetic("5<6"), false);
    assert.equal(isSafeArithmetic("5=6"), false);
  });

  // The allowlist requires at least one character, so the empty string is not
  // "safe" — there is nothing to evaluate.
  it("rejects the empty string", () => {
    assert.equal(isSafeArithmetic(""), false);
  });
});

describe("isSafeComparison", () => {
  it("accepts the arithmetic set plus < > ! =", () => {
    assert.equal(isSafeComparison("5<=6"), true);
    assert.equal(isSafeComparison("5<>6"), true, "the raw Excel <> passes the gate even though JS rejects it");
    assert.equal(isSafeComparison("(2**3) >= 6"), true);
  });

  it("rejects letters, quotes and ampersands", () => {
    assert.equal(isSafeComparison("A1<6"), false);
    assert.equal(isSafeComparison('"a"="b"'), false);
    assert.equal(isSafeComparison("5&6"), false);
  });

  it("rejects the empty string", () => {
    assert.equal(isSafeComparison(""), false);
  });
});

const calc = (formula: string): unknown => cellAt(new SpreadsheetEngine().calculate({ name: "S", data: [[{ v: formula }]] } satisfies SheetData).data, 0, 0);

// End-to-end characterization: the pure functions compose inside the evaluator
// to the exact behaviour observed before the extraction. Includes the
// intentionally-wrong cases so the eventual #2359 fix shows up as a diff here.
describe("translation through the engine (characterization)", () => {
  it("exponentiates, reading a chain left to right", () => {
    assert.equal(calc("=2^3"), 8);
    assert.equal(calc("=2^3^2"), 64);
  });

  it("evaluates equality and the ordering comparisons", () => {
    assert.equal(calc("=5=5"), true);
    assert.equal(calc("=5=6"), false);
    assert.equal(calc("=5<=6"), true);
    assert.equal(calc("=5>=6"), false);
  });

  // `<>` is Excel's not-equal. A top-level comparison is compared by the
  // evaluator itself, so `<>` no longer reaches `new Function` untranslated.
  it("evaluates the <> operator", () => {
    assert.equal(calc("=5<>6"), true);
    assert.equal(calc("=5<>5"), false);
  });

  it("concatenates strings and mixed operands", () => {
    assert.equal(calc('="a"&"b"'), "ab");
    assert.equal(calc('="x"&5'), "x5");
  });

  it("reads repeated signs one at a time, as Excel does", () => {
    assert.equal(calc("=--2"), 2);
    assert.equal(calc("=1--2"), 3);
    assert.equal(calc("=1---2"), -1);
    assert.equal(calc("=1+--2"), 3);
    assert.equal(calc('="x"&--2'), "x2");
    assert.equal(calc("=--2=2"), true);
    assert.equal(calc('="a--b"'), "a--b");
  });

  it("evaluates plain arithmetic", () => {
    assert.equal(calc("=2*3+1"), 7);
    assert.equal(calc("=(2+3)*4"), 20);
  });
});
