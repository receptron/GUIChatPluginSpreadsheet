// Comparisons over text, booleans and `&`. The evaluator's comparison path took
// numbers only, so `=A1&B1="12"` and `=C1="x"` came back as their own text.
// Excel orders numbers < text < booleans, compares text without case, and never
// finds a number equal to text. The generated cases check the engine against a
// reference written here from those rules; a failure prints the seed, rerun one
// with COMPARISON_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyComparison,
  compareCellValues,
  foldComparisons,
  splitTopLevelComparisons,
  type ExcelComparisonOperator,
} from "../../src/engine/textComparison.ts";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import type { CellValue } from "../../src/engine/types.ts";
import { cellAt } from "./cellAccess.ts";

describe("splitTopLevelComparisons", () => {
  it("splits on each of Excel's six operators, two-character ones first", () => {
    assert.deepEqual(splitTopLevelComparisons("a=b"), { operands: ["a", "b"], operators: ["="] });
    assert.deepEqual(splitTopLevelComparisons("a<>b"), { operands: ["a", "b"], operators: ["<>"] });
    assert.deepEqual(splitTopLevelComparisons("a<=b"), { operands: ["a", "b"], operators: ["<="] });
    assert.deepEqual(splitTopLevelComparisons("a>=b"), { operands: ["a", "b"], operators: [">="] });
    assert.deepEqual(splitTopLevelComparisons("a<b"), { operands: ["a", "b"], operators: ["<"] });
    assert.deepEqual(splitTopLevelComparisons("a>b"), { operands: ["a", "b"], operators: [">"] });
  });

  it("keeps every link of a chain, trimmed", () => {
    assert.deepEqual(splitTopLevelComparisons(" 1 = 1 = true "), { operands: ["1", "1", "true"], operators: ["=", "="] });
  });

  it("ignores operators inside literals and brackets", () => {
    assert.deepEqual(splitTopLevelComparisons('"a=b"&1="x<y"'), { operands: ['"a=b"&1', '"x<y"'], operators: ["="] });
    assert.deepEqual(splitTopLevelComparisons("(1<2)=true"), { operands: ["(1<2)", "true"], operators: ["="] });
    assert.deepEqual(splitTopLevelComparisons('"a\\"=b"="c"'), { operands: ['"a\\"=b"', '"c"'], operators: ["="] });
  });

  it("returns null when there is nothing to split", () => {
    assert.equal(splitTopLevelComparisons("1+2"), null);
    assert.equal(splitTopLevelComparisons('"a=b"'), null);
    assert.equal(splitTopLevelComparisons("(1=2)"), null);
    assert.equal(splitTopLevelComparisons(""), null);
  });

  it("returns null for an operator Excel does not have, or a missing side", () => {
    assert.equal(splitTopLevelComparisons("a==b"), null);
    assert.equal(splitTopLevelComparisons("a!=b"), null);
    assert.equal(splitTopLevelComparisons("a=>b"), null);
    assert.equal(splitTopLevelComparisons("=b"), null);
    assert.equal(splitTopLevelComparisons("a="), null);
    assert.equal(splitTopLevelComparisons("a= =b"), null);
  });
});

describe("compareCellValues", () => {
  it("orders numbers before text before booleans", () => {
    assert.ok(compareCellValues(1e9, "") < 0);
    assert.ok(compareCellValues("zzz", false) < 0);
    assert.ok(compareCellValues(1e9, false) < 0);
    assert.ok(compareCellValues(true, -1) > 0);
  });

  it("compares numbers by value and booleans with FALSE first", () => {
    assert.ok(compareCellValues(2, 10) < 0);
    assert.equal(compareCellValues(2.5, 2.5), 0);
    assert.ok(compareCellValues(false, true) < 0);
    assert.equal(compareCellValues(true, true), 0);
  });

  it("compares text without regard to case", () => {
    assert.equal(compareCellValues("Apple", "aPPLE"), 0);
    assert.ok(compareCellValues("a", "B") < 0, "case does not put B before a");
    assert.ok(compareCellValues("ab", "a") > 0);
    assert.ok(compareCellValues("", "a") < 0);
  });

  it("orders text by language, not by character code", () => {
    assert.ok(compareCellValues("_", "1") < 0, "punctuation before digits");
    assert.ok(compareCellValues("e", "é") < 0 && compareCellValues("é", "f") < 0, "é between e and f");
    assert.notEqual(compareCellValues("é", "e"), 0, "accents count");
    assert.equal(compareCellValues("É", "é"), 0, "case does not");
  });

  it("never finds a number equal to its own text", () => {
    assert.notEqual(compareCellValues(12, "12"), 0);
    assert.notEqual(compareCellValues(true, "TRUE"), 0);
  });
});

describe("applyComparison and foldComparisons", () => {
  it("applies each operator to the ordering", () => {
    const cases: [ExcelComparisonOperator, boolean, boolean, boolean][] = [
      // operator, a<b, a=b, a>b
      ["=", false, true, false],
      ["<>", true, false, true],
      ["<", true, false, false],
      [">", false, false, true],
      ["<=", true, true, false],
      [">=", false, true, true],
    ];
    cases.forEach(([operator, less, equal, greater]) => {
      assert.equal(applyComparison(operator, "a", "b"), less, `${operator} less`);
      assert.equal(applyComparison(operator, "a", "A"), equal, `${operator} equal`);
      assert.equal(applyComparison(operator, "b", "a"), greater, `${operator} greater`);
    });
  });

  it("folds a chain left to right", () => {
    assert.equal(foldComparisons([1, 1, true], ["=", "="]), true, "(1=1)=TRUE");
    assert.equal(foldComparisons([1, 2, false], ["=", "="]), true, "(1=2)=FALSE");
    assert.equal(foldComparisons([3, 2, 1], [">", ">"]), true, "(3>2)>1 — TRUE sorts after every number");
    assert.equal(foldComparisons(["x"], []), "x");
  });
});

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

const TEXTS = ["", "a", "A", "ab", "Ab", "b", "B", "x", "12", "1", "TRUE", "true", "z9", "Z9"];
const randomValue = (random: Random): string | number | boolean => {
  const kind = random();
  if (kind < 0.35) return pick(random, [0, 1, 2, 12, -3, 2.5]);
  if (kind < 0.8) return pick(random, TEXTS);
  return random() < 0.5;
};

// The reference: Excel's order as a sort key, written apart from compareCellValues.
const sortKey = (value: string | number | boolean): [number, number | string] => {
  if (typeof value === "number") return [0, value];
  if (typeof value === "string") return [1, value.toLowerCase()];
  return [2, value ? 1 : 0];
};
const referenceOrder = (left: string | number | boolean, right: string | number | boolean): number => {
  const [leftRank, leftKey] = sortKey(left);
  const [rightRank, rightKey] = sortKey(right);
  if (leftRank !== rightRank) return leftRank - rightRank;
  if (leftKey === rightKey) return 0;
  return leftKey < rightKey ? -1 : 1;
};

// Each operator's answer when the left side sorts before, equal to, or after the right.
const REFERENCE_OUTCOME: Record<ExcelComparisonOperator, readonly [boolean, boolean, boolean]> = {
  "=": [false, true, false],
  "<>": [true, false, true],
  "<": [true, false, false],
  ">": [false, false, true],
  "<=": [true, true, false],
  ">=": [false, true, true],
};
const referenceAnswer = (operator: ExcelComparisonOperator, ordering: number): boolean =>
  REFERENCE_OUTCOME[operator][ordering < 0 ? 0 : ordering === 0 ? 1 : 2];
const OPERATOR_LIST = Object.keys(REFERENCE_OUTCOME).filter((operator): operator is ExcelComparisonOperator => operator in REFERENCE_OUTCOME);

// Math.sign keeps -0, which strict equality tells apart from 0.
const signOf = (ordering: number): number => (ordering > 0 ? 1 : ordering < 0 ? -1 : 0);

const GENERATED_CASES = 1500;
const baseSeed = Number(process.env.COMPARISON_SEED ?? Date.now() % 1_000_000);

describe("compareCellValues over generated values", () => {
  it(`agrees with the sort-key reference and is antisymmetric (seed ${baseSeed})`, () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const left = randomValue(random);
      const right = randomValue(random);
      const label = `seed ${baseSeed}: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`;
      assert.equal(signOf(compareCellValues(left, right)), signOf(referenceOrder(left, right)), label);
      assert.equal(signOf(compareCellValues(left, right)), signOf(-compareCellValues(right, left)), label);
    });
  });

  it(`sorts a generated list into the reference order (seed ${baseSeed})`, () => {
    const random = seededRandom(baseSeed + 1);
    const values = Array.from({ length: 60 }, () => randomValue(random));
    const sorted = values.toSorted(compareCellValues);
    sorted.slice(1).forEach((value, index) => assert.ok(referenceOrder(sorted[index], value) <= 0, `seed ${baseSeed}: ${JSON.stringify(sorted)}`));
  });
});

const calcRow = (row: unknown[], formula: string): unknown => {
  const data = new SpreadsheetEngine().calculate({ name: "S", data: [[...row, formula].map((v) => ({ v }))] } satisfies SheetData).data;
  return cellAt(data, 0, row.length);
};
const calc = (formula: string): unknown => calcRow([1, 2, "x", true, 'say "hi"'], formula);

describe("comparisons through the engine", () => {
  it("compares the text a & joins", () => {
    assert.equal(calc('=A1&B1="12"'), true);
    assert.equal(calc('="a"&1="a1"'), true);
    assert.equal(calc("=A1&B1=3"), false, '"12" is text, so it is not 3');
    assert.equal(calc("=A1&B1=12"), false);
    assert.equal(calc('=A1&B1<>"12"'), false);
    assert.equal(calc('="a"&"b"<"b"'), true);
  });

  it("compares text read from a cell or written as a literal, without case", () => {
    assert.equal(calc('=C1="x"'), true);
    assert.equal(calc('=C1="X"'), true);
    assert.equal(calc('=C1<>"y"'), true);
    assert.equal(calc('="a"="A"'), true);
    assert.equal(calc('="b">"a"'), true);
    assert.equal(calc('="B">"a"'), true);
    assert.equal(calc('="a"<"B"'), true);
  });

  it("compares text holding quotes", () => {
    assert.equal(calc("=E1=E1"), true);
    assert.equal(calc('=E1="x"'), false);
    assert.equal(calc('=E1&"!"=E1'), false);
  });

  it("orders numbers before text before booleans", () => {
    assert.equal(calc('=1="1"'), false);
    assert.equal(calc('=1<"a"'), true);
    assert.equal(calc('="z"<TRUE'), true);
    assert.equal(calc("=2.5>TRUE"), false);
    assert.equal(calc("=D1=TRUE"), true);
    assert.equal(calc("=D1>FALSE"), true);
  });

  it("reads a chain left to right", () => {
    assert.equal(calc('="a"="a"=TRUE'), true);
    assert.equal(calc('=C1="y"=FALSE'), true);
  });

  it("still compares numbers the way it did", () => {
    assert.equal(calc("=A1=1"), true);
    assert.equal(calc("=A1<B1"), true);
    assert.equal(calc("=A1+B1>=3"), true);
  });

  it("compares numbers with <>, a chain, and a side that divides by zero as Excel does", () => {
    assert.equal(calc("=A1<>B1"), true);
    assert.equal(calc("=A1<>1"), false);
    assert.equal(calc("=1<2<3"), false, "(1<2) is TRUE, and TRUE sorts after 3");
    assert.equal(calc("=3>2>1"), true);
    assert.equal(calc("=1/0>1"), "#DIV/0!", "JS answered Infinity>1 = TRUE");
  });

  it("propagates an error from either side", () => {
    assert.equal(calc('=1/0="x"'), "#DIV/0!");
    assert.equal(calc('="x"=1/0'), "#DIV/0!");
  });

  it("compares an IF condition the same way", () => {
    assert.equal(calc('=IF(A1&B1="12","y","n")'), "y");
    assert.equal(calc('=IF(C1="X","y","n")'), "y");
    assert.equal(calc('=IF(1="1","y","n")'), "n", "a number is not equal to its text");
    assert.equal(calc('=IF(A1<>B1,"y","n")'), "y");
  });

  it("still reads a formula that is one literal as its text", () => {
    assert.equal(calc('="abc"'), "abc");
    assert.equal(calc('="a=b"'), "a=b");
  });

  it("leaves a literal that is never closed as it was", () => {
    assert.equal(calc('="abc'), '"abc');
    assert.equal(calc("='abc"), "'abc");
    assert.equal(calc(`="abc'`), `"abc'`, "closed by the other quote is not closed");
    assert.equal(calc('="abc="x"'), 'abc="x', "read as before, not as a comparison");
    assert.equal(calc('=1="abc'), '1="abc', "an unclosed side is not read, so the formula comes back as its text");
  });

  it("returns the text of a comparison it cannot read, as before", () => {
    assert.equal(typeof calc('="a"=foo'), "string");
  });
});

/** An operand written into a formula, with the value Excel gives it. */
interface WrittenOperand {
  text: string;
  value: string | number | boolean;
}

const asJoinedText = (value: string | number | boolean): string => (typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value));

// A cell holding the text "12" is read as the number 12, so no cell holds numeric text.
const CELL_VALUES: (string | number | boolean)[] = [1, 2, "x", "X", "ab", true, false, 12];
const CELL_NAMES = ["A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1"];

// A TRUE / FALSE written into a `&` join is not read yet (`=FALSE&2` comes back as its text),
// so the joins take booleans from cells and the words stand only as a whole operand.
function writtenAtom(random: Random, allowBooleanWord: boolean): WrittenOperand {
  const choice = random();
  if (choice < 0.4) {
    const index = Math.floor(random() * CELL_VALUES.length);
    return { text: CELL_NAMES[index], value: CELL_VALUES[index] };
  }
  if (choice < 0.65) {
    const text = pick(random, ["a", "A", "x", "ab", "", "12", "zz"]);
    return { text: `"${text}"`, value: text };
  }
  if (choice < 0.85 || !allowBooleanWord) {
    const number = pick(random, [0, 1, 2, 12, 2.5]);
    return { text: String(number), value: number };
  }
  const flag = random() < 0.5;
  return { text: flag ? "TRUE" : "FALSE", value: flag };
}

function writtenOperand(random: Random): WrittenOperand {
  if (random() < 0.6) return writtenAtom(random, true);
  const first = writtenAtom(random, false);
  const second = writtenAtom(random, false);
  return { text: `${first.text}&${second.text}`, value: asJoinedText(first.value) + asJoinedText(second.value) };
}

describe("engine comparisons over generated operands", () => {
  it(`agree with the sort-key reference (seed ${baseSeed})`, () => {
    const random = seededRandom(baseSeed + 2);
    Array.from({ length: 400 }).forEach((_, caseIndex) => {
      const left = writtenOperand(random);
      const right = writtenOperand(random);
      const operator = pick(random, OPERATOR_LIST);
      const formula = `=${left.text}${operator}${right.text}`;
      const expected: CellValue = referenceAnswer(operator, referenceOrder(left.value, right.value));
      assert.equal(calcRow(CELL_VALUES, formula), expected, `seed ${baseSeed} case ${caseIndex}: ${formula}`);
    });
  });
});
