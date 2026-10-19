// A text cell read by a formula is its text unless the WHOLE text is a number as typed (#140).
// `2023-01` read as 2023 and `Tokyo, Japan` read as 0, with the cell itself still showing the text.
// Generated: NUMBERS_SEED=<seed> replays a run.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateSheet, type SheetData } from "../../src/engine/index.ts";
import { parseNumericString } from "../../src/engine/numericCoercion.ts";

const read = (text: string, formulas: string[]): unknown[] => {
  const sheet: SheetData = { name: "S", data: [[text, ...formulas].map((v) => ({ v }))] };
  return calculateSheet(sheet, [sheet], { skipFormatting: true }).data[0]?.slice(1) ?? [];
};

describe("a text cell read by a formula (#140)", () => {
  for (const text of ["2023-01", "12abc", "Tokyo, Japan", "5% off", "$5 each", "1,2,3"]) {
    it(`keeps ${JSON.stringify(text)} as text`, () => {
      assert.deepEqual(read(text, ["=A1", "=LEN(A1)", '=A1&"|"', `=IF(A1="${text}",1,0)`]), [text, text.length, `${text}|`, 1]);
    });
  }

  it("takes a month column apart as text", () => {
    assert.deepEqual(read("2023-01", ["=VALUE(RIGHT(A1,2))", "=VALUE(LEFT(A1,4))"]), [1, 2023]);
  });

  it("is counted by COUNT exactly when SUM adds it, whatever a formula returns", () => {
    const returned = ['"12"', '"1,200"', '"25%"', '"0x1F"', '"Infinity"', '"12abc"', '""'];
    const sheet: SheetData = {
      name: "S",
      data: [...returned.map((text) => [{ v: `=${text}` }]), [{ v: `=SUM(A1:A${returned.length})` }, { v: `=COUNT(A1:A${returned.length})` }]],
    };
    assert.deepEqual(calculateSheet(sheet, [sheet], { skipFormatting: true }).data[returned.length], [12 + 1200 + 0.25, 3]);
  });

  it("is #VALUE! in arithmetic and left out of a sum, as text is", () => {
    assert.deepEqual(read("12abc", ["=A1+1", "=SUM(A1:A1)", "=COUNT(A1:A1)"]).map(String), ["#VALUE!", "0", "0"]);
  });

  it("is #VALUE! to a date function rather than serial 0, as calendar functions already answer", () => {
    assert.deepEqual(
      read("2023-01", ["=YEAR(A1)", "=MONTH(A1)", "=DAY(A1)", "=HOUR(A1)", '=DATEDIF(A1,45000,"D")', "=WEEKDAY(A1)"]).map(String),
      Array(6).fill("#VALUE!"),
    );
  });

  it("still reads a number typed with separators, a percentage or a currency sign", () => {
    const typed: [string, number][] = [
      ["1,200", 1200],
      ["25%", 0.25],
      ["$1,000", 1000],
      ["-$5", -5],
      ["$ 5", 5],
      [" 42 ", 42],
    ];
    for (const [text, number] of typed) {
      assert.deepEqual(read(text, ["=A1", "=A1+0"]), [number, number], text);
    }
  });
});

const SEED = Number(process.env.NUMBERS_SEED ?? Date.now() % 1_000_000);
const grouped = (n: number): string => {
  const [whole = "", fraction] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${whole.replace(/\B(?=(\d{3})+$)/g, ",")}.${fraction}`;
};
describe(`parseNumericString over generated numbers (NUMBERS_SEED=${SEED})`, () => {
  const random = (() => {
    let state = SEED;
    return (): number => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  })();
  const ROUNDS = 2000;
  const samples = Array.from({ length: ROUNDS }, () => Math.round((random() - 0.5) * 10 ** (1 + Math.floor(random() * 8)) * 100) / 100);

  it("reads every number back, written plainly, grouped, as a percentage or with a currency sign", () => {
    const wrong = samples.flatMap((n) => {
      const forms: [string, number][] = [
        [String(n), n],
        [grouped(n), n],
        [`${n}%`, n / 100],
        [n < 0 ? `-$${grouped(-n)}` : `$${grouped(n)}`, n],
      ];
      return forms
        .filter(([text, expected]) => Math.abs((parseNumericString(text) ?? NaN) - expected) > 1e-9 * Math.max(1, Math.abs(expected)))
        .map(([text]) => text);
    });
    assert.deepEqual(wrong.slice(0, 5), [], `seed ${SEED}`);
  });

  it("reads none of them with text after it", () => {
    const readAsNumbers = samples
      .flatMap((n) => ["abc", "-01", " kg", ",x", "%x"].map((tail) => `${n}${tail}`))
      .filter((text) => parseNumericString(text) !== null);
    assert.deepEqual(readAsNumbers.slice(0, 5), [], `seed ${SEED}`);
  });
});
