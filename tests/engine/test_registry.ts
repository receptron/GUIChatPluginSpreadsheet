// The two helpers every conditional and arithmetic function leans on.
//
// Neither can fail loudly: `toNumber` returns 0 for anything it cannot read,
// and `parseCriteria` returns a predicate that answers false. So a mistake here
// does not surface as an error — a SUM comes out smaller than it should, or a
// COUNTIF reports zero matches, and both look like ordinary answers.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isCallableName, parseCriteria, toNumber, toString } from "../../src/engine/registry.ts";
import "../../src/engine/functions/index.ts";
import type { CellValue } from "../../src/engine/types.ts";

const num = (value: CellValue) => toNumber(value);

describe("toNumber — numbers pass through", () => {
  it("returns a number unchanged, including 0 and negatives", () => {
    assert.equal(num(42), 42);
    assert.equal(num(0), 0);
    assert.equal(num(-7.5), -7.5);
  });
});

describe("toNumber — formatted strings", () => {
  it("reads a percentage as its decimal value", () => {
    assert.equal(num("5%"), 0.05);
    assert.equal(num("100%"), 1);
    // Dividing by 100 is a binary-float operation, so a value with enough
    // decimals lands a rounding step away from the exact literal.
    assert.ok(Math.abs(num("0.4167%") - 0.004167) < 1e-12);
  });

  it("reads a currency string, stripping the symbol and separators", () => {
    assert.equal(num("$1000"), 1000);
    assert.equal(num("$1,000"), 1000);
    assert.equal(num("$1,000.50"), 1000.5);
  });

  it("reads a comma-separated number", () => {
    assert.equal(num("1,000"), 1000);
    assert.equal(num("1,234,567"), 1234567);
  });

  it("reads a plain numeric string, tolerating surrounding whitespace", () => {
    assert.equal(num("42"), 42);
    assert.equal(num("  42  "), 42);
    assert.equal(num("-3.5"), -3.5);
    assert.equal(num("1e3"), 1000);
  });
});

describe("toNumber — the branch order is load-bearing", () => {
  // The checks run `%` → `$` → `,` → plain, and each strips only its OWN
  // characters. A string carrying two of them therefore falls into the first
  // branch and fails to parse there, yielding 0 rather than a number.
  it("returns 0 for a string mixing a percent with a currency symbol", () => {
    assert.equal(num("$1,000%"), 0);
  });

  it("reads a percent string with thousands separators", () => {
    assert.equal(num("1,000%"), 10);
  });

  it("handles a currency string with a percent-free comma correctly", () => {
    assert.equal(num("$2,500.25"), 2500.25);
  });
});

describe("toNumber — everything unreadable becomes 0", () => {
  // This is the silent path: a text cell inside a SUM range contributes 0
  // instead of raising, so the total is quietly short.
  it("returns 0 for non-numeric text", () => {
    assert.equal(num("hello"), 0);
    assert.equal(num(""), 0);
    assert.equal(num("   "), 0);
    assert.equal(num("N/A"), 0);
  });

  // `CellValue` is `number | string | boolean`, so an empty cell is never
  // null here — `getRawValue` in the calculator maps blanks to 0 before this
  // is reached. Booleans, though, are in the type and become 0 rather than
  // 1/0 as Excel would have them.
  it("returns 0 for booleans, not Excel's 1 and 0", () => {
    assert.equal(num(true), 0);
    assert.equal(num(false), 0);
  });

  it("reads text that only starts with a number as 0, as text is (#140)", () => {
    assert.equal(num("12abc"), 0);
    assert.equal(num("3.5kg"), 0);
  });

  it("returns 0 when the number does not come first", () => {
    assert.equal(num("abc12"), 0);
  });
});

describe("toString", () => {
  it("stringifies every shape `CellValue` allows", () => {
    assert.equal(toString(42), "42");
    assert.equal(toString("text"), "text");
    assert.equal(toString(true), "TRUE", "as Excel writes a logical value");
    assert.equal(toString(false), "FALSE");
    assert.equal(toString(""), "");
    assert.equal(toString(0), "0");
  });
});

describe("parseCriteria — comparison operators", () => {
  it("compares greater-than and greater-or-equal at the boundary", () => {
    const greater = parseCriteria(">5");
    assert.equal(greater(5), false);
    assert.equal(greater(6), true);

    const gte = parseCriteria(">=5");
    assert.equal(gte(4), false);
    assert.equal(gte(5), true, "the boundary value must count for >=");
    assert.equal(gte(6), true);
  });

  it("compares less-than and less-or-equal at the boundary", () => {
    const less = parseCriteria("<5");
    assert.equal(less(5), false);
    assert.equal(less(4), true);

    const lte = parseCriteria("<=5");
    assert.equal(lte(6), false);
    assert.equal(lte(5), true, "the boundary value must count for <=");
  });

  it("accepts both spellings of equality and inequality", () => {
    for (const criteria of ["=5", "==5"]) {
      assert.equal(parseCriteria(criteria)(5), true, `${criteria} should match 5`);
      assert.equal(parseCriteria(criteria)(6), false);
    }
    for (const criteria of ["!=5", "<>5"]) {
      assert.equal(parseCriteria(criteria)(5), false, `${criteria} should not match 5`);
      assert.equal(parseCriteria(criteria)(6), true);
    }
  });

  // A criteria is the value its argument evaluated to: its quotes and spaces are part of it.
  it("keeps quotes and spaces as part of the criteria", () => {
    assert.equal(parseCriteria('">5"')(6), false);
    assert.equal(parseCriteria('">5"')('">5"'), true);
    assert.equal(parseCriteria(" x")("x"), false);
    assert.equal(parseCriteria(" x")(" x"), true);
    assert.equal(parseCriteria("= x")(" x"), true);
  });

  it("reads the number after an operator with spaces around it", () => {
    assert.equal(parseCriteria(">= 5")(5), true);
    assert.equal(parseCriteria(">5 ")(6), true);
  });

  it("matches only an empty cell with a bare =, not one holding a space", () => {
    assert.equal(parseCriteria("=")(""), true);
    assert.equal(parseCriteria("=")(" "), false);
    assert.equal(parseCriteria("<>")(" "), true);
  });
});

describe("parseCriteria — the ways it silently matches nothing", () => {
  // An unrecognised operator lands in the `default` arm, which answers false
  // for every value. A COUNTIF written this way reports 0 matches and reads
  // like a real answer.
  it("matches nothing for an operator written backwards", () => {
    const backwards = parseCriteria("=>5");
    assert.equal(backwards(5), false);
    assert.equal(backwards(6), false);
    assert.equal(backwards(4), false);
  });

  // A non-numeric comparand makes every numeric comparison false, since
  // `NaN > x` and `NaN < x` are both false.
  it("matches nothing when a comparison operator is given non-numeric text", () => {
    const gtText = parseCriteria(">abc");
    assert.equal(gtText(0), false);
    assert.equal(gtText(1000), false);
    assert.equal(gtText("abc"), false);
  });

  // `*` and `?` are Excel wildcards; `~` escapes them back to literals.
  it("treats a wildcard as a pattern, and ~ escapes it", () => {
    const wildcard = parseCriteria("app*");
    assert.equal(wildcard("apple"), true);
    assert.equal(wildcard("app"), true, "* may match nothing");
    assert.equal(wildcard("axe"), false);
    assert.equal(parseCriteria("app~*")("app*"), true, "escaped, so only the literal matches");
    assert.equal(parseCriteria("app~*")("apple"), false);
  });
});

describe("parseCriteria — exact match", () => {
  it("matches a plain string exactly", () => {
    const apple = parseCriteria("apple");
    assert.equal(apple("apple"), true);
    assert.equal(apple("Apple"), true, "matching is case-insensitive, as in Excel");
    assert.equal(apple("apples"), false);
  });

  it("matches a number written either as text or as a number", () => {
    const five = parseCriteria("5");
    assert.equal(five(5), true);
    assert.equal(five("5"), true);
    assert.equal(five("5.0"), true, "numeric equality catches a different spelling");
    assert.equal(five(6), false);
  });

  // `toNumber` reads unreadable text as 0, so a criteria of "0" used to match
  // every text cell and inflate a COUNTIF with no sign of it. Excel compares a
  // number criteria with numbers only.
  it("does not match unreadable text when the criteria is 0", () => {
    const zero = parseCriteria("0");
    assert.equal(zero(0), true);
    assert.equal(zero("hello"), false);
    assert.equal(zero(""), false, "a blank is not the number 0");
  });

  it("keeps quotes around an exact-match criteria as text", () => {
    assert.equal(parseCriteria('"apple"')("apple"), false);
    assert.equal(parseCriteria('"apple"')('"apple"'), true);
  });

  it("matches an empty criteria against an empty string", () => {
    assert.equal(parseCriteria("")(""), true);
    assert.equal(parseCriteria("")("x"), false);
  });
});

describe("isCallableName", () => {
  it("accepts any letters-only name, so an unknown one can report #NAME?", () => {
    assert.equal(isCallableName("SUM"), true);
    assert.equal(isCallableName("sum"), true);
    assert.equal(isCallableName("NOSUCHFUNCTION"), true);
  });

  it("accepts a name with digits only when it is registered", () => {
    assert.equal(isCallableName("LOG10"), true);
    assert.equal(isCallableName("log10"), true);
    assert.equal(isCallableName("A1"), false);
    assert.equal(isCallableName("LOG11"), false);
  });
});
