// The text order comparisons use: Excel's, case ignored and accents counted, written as a table
// rather than taken from the runtime's ICU so that every machine answers alike. The ASCII table
// was measured from Intl.Collator("en"); the generated check below keeps it honest against this
// runtime's ICU. Rerun one seed with COLLATION_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareText } from "../../src/engine/textCollation.ts";
import { pick, seededRandom } from "./seededRandom.ts";

const sign = (value: number): number => (value > 0 ? 1 : value < 0 ? -1 : 0);

describe("compareText", () => {
  it("ignores case", () => {
    assert.equal(compareText("Apple", "aPPLE"), 0);
    assert.equal(compareText("É", "é"), 0);
    assert.ok(compareText("a", "B") < 0);
  });

  it("treats a composed and a decomposed accent as the same", () => {
    assert.equal(compareText("é", "e\u0301"), 0);
    assert.equal(compareText("É", "e\u0301"), 0);
    assert.ok(compareText("e\u0301", "f") < 0);
  });

  it("counts accents, after the base letters", () => {
    assert.ok(compareText("e", "é") < 0);
    assert.ok(compareText("é", "f") < 0);
    assert.ok(compareText("ä", "a b") < 0, "the base letters decide before the accent does");
  });

  it("puts punctuation before digits before letters", () => {
    assert.ok(compareText("_", "1") < 0);
    assert.ok(compareText("9", "a") < 0);
    assert.ok(compareText("a b", "a-b") < 0);
    assert.ok(compareText("10", "9") < 0, "text, so digit by digit");
  });

  it("puts other scripts after ASCII, by code point", () => {
    assert.ok(compareText("z", "あ") < 0);
    assert.ok(compareText("あ", "ア") < 0);
    assert.ok(compareText("ア", "日") < 0);
  });

  it("orders the whitespace controls before the space, as ICU does", () => {
    assert.ok(compareText("\t", " ") < 0);
    assert.ok(compareText("x\ty", "x y") < 0);
    assert.ok(compareText("\n", "\r") < 0);
  });

  it("ignores the other control characters, as ICU does", () => {
    assert.equal(compareText("a\u0001", "a"), 0);
    assert.equal(compareText("a\u007f", "a"), 0);
    assert.ok(compareText("\u0000b", "a") > 0);
  });

  it("compares a character outside the BMP by its code point", () => {
    assert.ok(compareText("\uFFFD", "😀") < 0, "as UTF-16 halves, the emoji would come first");
    assert.ok(compareText("😀", "😁") < 0);
  });

  it("puts a prefix first and the empty text before everything", () => {
    assert.ok(compareText("ab", "abc") < 0);
    assert.ok(compareText("", " ") < 0);
    assert.equal(compareText("", ""), 0);
  });
});

const ASCII_PRINTABLE = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index));
const ACCENTED = ["é", "É", "è", "ä", "Ö", "ñ", "ç"];
const baseSeed = Number(process.env.COLLATION_SEED ?? Date.now() % 1_000_000);
const GENERATED_PAIRS = 3000;

function generatedText(random: () => number, alphabet: readonly string[]): string {
  return Array.from({ length: Math.floor(random() * 5) }, () => pick(random, alphabet)).join("");
}

describe(`compareText over generated text (seed ${baseSeed})`, () => {
  it("orders ASCII text as this runtime's Intl.Collator('en') does", () => {
    const icu = new Intl.Collator("en", { sensitivity: "accent" });
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_PAIRS }).forEach(() => {
      const [left, right] = [generatedText(random, ASCII_PRINTABLE), generatedText(random, ASCII_PRINTABLE)];
      assert.equal(sign(compareText(left, right)), sign(icu.compare(left, right)), `seed ${baseSeed}: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`);
    });
  });

  it("is antisymmetric, and equal only for text that differs in case alone", () => {
    const random = seededRandom(baseSeed + 1);
    const alphabet = [...ASCII_PRINTABLE.slice(0, 40), "a", "A", "b", "B", ...ACCENTED];
    Array.from({ length: GENERATED_PAIRS }).forEach(() => {
      const [left, right] = [generatedText(random, alphabet), generatedText(random, alphabet)];
      const label = `seed ${baseSeed}: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`;
      assert.equal(sign(compareText(left, right)), sign(-compareText(right, left)), label);
      assert.equal(compareText(left, right) === 0, left.toLowerCase() === right.toLowerCase(), label);
    });
  });

  it("sorts consistently: every neighbour in a sorted list is in order", () => {
    const random = seededRandom(baseSeed + 2);
    const alphabet = [...ASCII_PRINTABLE, ...ACCENTED, "あ", "日"];
    const sorted = Array.from({ length: 300 }, () => generatedText(random, alphabet)).toSorted(compareText);
    sorted
      .slice(1)
      .forEach((text, index) =>
        assert.ok(compareText(sorted[index] ?? "", text) <= 0, `seed ${baseSeed}: ${JSON.stringify(sorted[index])} then ${JSON.stringify(text)}`),
      );
  });
});
