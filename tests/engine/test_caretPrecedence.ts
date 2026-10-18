// `^` follows Excel's precedence: a unary sign binds tighter than `^`
// (`-2^2` = 4) and a chain reads left to right (`2^3^2` = 64). The generated
// expressions are checked against a small reference evaluator written from
// those rules, independent of caretToPow. A failure prints the seed and the
// expression; rerun one seed with CARET_SEED=<seed>. A sign is always spaced
// off from the operator before it: outside a `^` chain the text is passed
// through as written, and JS reads a bare `1--2` as a decrement.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { caretToPow, tokenizeOperators, SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { cellAt } from "./cellAccess.ts";

const GENERATED_CASES = 2000;
const MAX_DEPTH = 4;
const SMALL_INTEGER_LIMIT = 4;

/** mulberry32: a small seeded generator so a failing case can be replayed. */
function seededRandom(seed: number): () => number {
  const state = { value: seed >>> 0 };
  return () => {
    state.value = (state.value + 0x6d2b79f5) >>> 0;
    const mixed = Math.imul(state.value ^ (state.value >>> 15), 1 | state.value);
    const scrambled = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((scrambled ^ (scrambled >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;
const pick = <T>(random: Random, items: readonly T[]): T => items[Math.floor(random() * items.length)];
const space = (random: Random): string => (random() < 0.2 ? " " : "");

function generateAtom(random: Random, depth: number): string {
  if (depth >= MAX_DEPTH || random() < 0.5) return String(Math.floor(random() * SMALL_INTEGER_LIMIT) + 1);
  return `(${generateExpression(random, depth + 1)})`;
}

function generateOperand(random: Random, depth: number): string {
  const signs = random() < 0.3 ? pick(random, [" -", " +", " - -", " -+", " - "]) : "";
  return signs + generateAtom(random, depth);
}

function generateExpression(random: Random, depth: number): string {
  const terms = [generateOperand(random, depth)];
  const extra = Math.floor(random() * 3);
  Array.from({ length: extra }).forEach(() =>
    terms.push(`${space(random)}${pick(random, ["+", "-", "*", "/", "^", "^"])}${space(random)}`, generateOperand(random, depth)),
  );
  return terms.join("");
}

// Reference evaluator: Excel precedence, written as a recursive-descent parser.
// unary signs > ^ (left to right) > * / > + -
interface Cursor {
  text: string;
  position: number;
}

const peek = (cursor: Cursor): string => {
  while (cursor.text[cursor.position] === " ") cursor.position += 1;
  return cursor.text[cursor.position] ?? "";
};

function parsePrimary(cursor: Cursor): number {
  if (peek(cursor) === "(") {
    cursor.position += 1;
    const value = parseSum(cursor);
    assert.equal(peek(cursor), ")", `unbalanced reference input ${cursor.text}`);
    cursor.position += 1;
    return value;
  }
  const digits = /^\d+/.exec(cursor.text.slice(cursor.position))?.[0] ?? "";
  assert.ok(digits !== "", `reference parser stuck at ${cursor.position} in ${cursor.text}`);
  cursor.position += digits.length;
  return Number(digits);
}

function parseSigned(cursor: Cursor): number {
  const sign = peek(cursor);
  if (sign === "-" || sign === "+") {
    cursor.position += 1;
    const value = parseSigned(cursor);
    return sign === "-" ? -value : value;
  }
  return parsePrimary(cursor);
}

function parsePower(cursor: Cursor): number {
  let value = parseSigned(cursor);
  while (peek(cursor) === "^") {
    cursor.position += 1;
    value = value ** parseSigned(cursor);
  }
  return value;
}

function parseProduct(cursor: Cursor): number {
  let value = parsePower(cursor);
  while (peek(cursor) === "*" || peek(cursor) === "/") {
    const operator = cursor.text[cursor.position];
    cursor.position += 1;
    const right = parsePower(cursor);
    value = operator === "*" ? value * right : value / right;
  }
  return value;
}

function parseSum(cursor: Cursor): number {
  let value = parseProduct(cursor);
  while (peek(cursor) === "+" || peek(cursor) === "-") {
    const operator = cursor.text[cursor.position];
    cursor.position += 1;
    const right = parseProduct(cursor);
    value = operator === "+" ? value + right : value - right;
  }
  return value;
}

const excelValue = (expr: string): number => parseSum({ text: expr, position: 0 });
const translatedValue = (expr: string): unknown => {
  try {
    return new Function(`return (${caretToPow(expr)});`)();
  } catch (error) {
    return error;
  }
};

const sameNumber = (left: unknown, right: number): boolean =>
  Object.is(left, right) || left === right || (typeof left === "number" && Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(right)));

const baseSeed = Number(process.env.CARET_SEED ?? Date.now() % 1_000_000);

describe("caretToPow against an Excel-precedence reference evaluator", () => {
  it(`agrees on ${GENERATED_CASES} generated expressions (seed ${baseSeed})`, () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach((_, index) => {
      const expr = generateExpression(random, 0);
      const expected = excelValue(expr);
      const actual = translatedValue(expr);
      assert.ok(sameNumber(actual, expected), `seed ${baseSeed} case ${index}: ${expr} → ${caretToPow(expr)} gave ${String(actual)}, Excel ${expected}`);
    });
  });
});

describe("tokenizeOperators", () => {
  const characters = ['"', "'", "\\", "^", "-", "+", "(", ")", " ", "1", ".", "e", "a", "&", "*"];

  it(`gives the input back when the tokens are joined (seed ${baseSeed})`, () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const text = Array.from({ length: Math.floor(random() * 12) }, () => pick(random, characters)).join("");
      assert.equal(
        tokenizeOperators(text)
          .map((token) => token.text)
          .join(""),
        text,
      );
    });
  });

  it("keeps a quoted literal, escapes included, as one token", () => {
    assert.deepEqual(
      tokenizeOperators('"a\\"^b"^2').map((token) => token.kind),
      ["literal", "caret", "number"],
    );
  });

  it("reads a number with a decimal point or an exponent as one token", () => {
    assert.deepEqual(
      tokenizeOperators("1.5e+3^.5").map((token) => token.text),
      ["1.5e+3", "^", ".5"],
    );
  });

  it("returns no tokens for the empty string", () => {
    assert.deepEqual(tokenizeOperators(""), []);
  });
});

const calc = (formula: string, row: SheetData["data"][number] = []): unknown =>
  cellAt(new SpreadsheetEngine().calculate({ name: "S", data: [[...row, { v: formula }]] } satisfies SheetData).data, 0, row.length);

describe("^ through the engine", () => {
  it("negates the base before raising it, as Excel does", () => {
    assert.equal(calc("=-2^2"), 4);
    assert.equal(calc("=--2^2"), 4);
    assert.equal(calc("=-+2^2"), 4);
    assert.equal(calc("=-2^3"), -8);
    assert.equal(calc("=-(1+1)^2"), 4);
  });

  it("keeps a binary minus in front of ^ binary", () => {
    assert.equal(calc("=1-2^2"), -3);
    assert.equal(calc("=1 - 2 ^ 2"), -3);
    assert.equal(calc("=1--2^2"), -3);
  });

  it("reads a chain of ^ left to right", () => {
    assert.equal(calc("=2^3^2"), 64);
    assert.equal(calc("=(2^3)^2"), 64);
    assert.equal(calc("=2^(3^2)"), 512);
  });

  it("accepts a signed exponent", () => {
    assert.equal(calc("=2^-2"), 0.25);
    assert.equal(calc("=2*-3^2"), 18);
  });

  it("raises a negative value read from a cell", () => {
    assert.equal(calc("=A1^2", [{ v: -2 }]), 4);
    assert.equal(calc("=-A1^2", [{ v: 3 }]), 9);
    assert.equal(calc("=5-A1^2", [{ v: -3 }]), -4);
  });

  it("raises the result of a function", () => {
    assert.equal(calc("=ABS(-2)^2"), 4);
    assert.equal(calc("=-ABS(-2)^2"), 4);
  });

  it("joins a power with & after evaluating it", () => {
    assert.equal(calc('="a"&-2^2'), "a4");
    assert.equal(calc('="a"&2^3^2'), "a64");
  });

  it("leaves a ^ inside a text literal alone", () => {
    assert.equal(calc('="a^b"'), "a^b");
    assert.equal(calc('="a^b"&1'), "a^b1");
  });

  it("leaves a formula without ^ as it was written", () => {
    assert.equal(calc("=- -2"), 2);
    assert.equal(calc("=1 - -2"), 3);
    assert.equal(calc("=-(2)"), -2);
  });

  it("still reports a dangling ^ as an error", () => {
    assert.equal(calc("=2^"), "#ERROR!");
  });
});
