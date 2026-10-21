// A blank cell joins as "" but computes as 0, as in Excel: `=A1&"x"` on a blank A1
// is "x", while `=A1*2&"x"` is "0x". The blank used to be read as 0 before the
// formula saw it, so every join put a 0 in. The generated cases build expressions
// whose answer is known by construction; a failure prints the seed, rerun one with
// EMPTY_CONCAT_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { standsAloneInConcat } from "../../src/engine/concatOperand.ts";
import { isBlankCell } from "../../src/engine/cellEmpty.ts";
import { spreadsheetError } from "../../src/engine/spreadsheet-errors.ts";
import { normalizeData, SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { cellAt } from "./cellAccess.ts";
import { seededRandom, pick } from "./seededRandom.ts";

/** standsAloneInConcat for the first occurrence of `ref` in `expr`. */
const alone = (expr: string, ref = "A1"): boolean => {
  const start = expr.indexOf(ref);
  assert.ok(start >= 0, `${ref} is in ${expr}`);
  return standsAloneInConcat(expr, start, start + ref.length);
};

describe("standsAloneInConcat", () => {
  it("is true for an operand of &, on either side", () => {
    assert.equal(alone('A1&"x"'), true);
    assert.equal(alone('"x"&A1'), true);
    assert.equal(alone('"x"&A1&"y"'), true);
    assert.equal(alone('"x" & A1 & "y"'), true);
  });

  it("looks through brackets that hold only the reference", () => {
    assert.equal(alone('(A1)&"x"'), true);
    assert.equal(alone('"x"&((A1))'), true);
    assert.equal(alone('("y"&(A1))&"x"'), true);
  });

  it("is false where the reference is computed with", () => {
    assert.equal(alone('A1*2&"x"'), false);
    assert.equal(alone('"x"&A1+1'), false);
    assert.equal(alone('"x"&-A1'), false);
    assert.equal(alone('(A1+1)&"x"'), false);
    assert.equal(alone('"x"&(1-A1)'), false);
    assert.equal(alone('A1="x"&"y"'), false);
  });

  it("is false without any &", () => {
    assert.equal(alone("A1"), false);
    assert.equal(alone("(A1)"), false);
    assert.equal(alone("A1+1"), false);
  });
});

describe("isBlankCell", () => {
  it("counts every form of an empty cell", () => {
    [null, undefined, "", "  ", {}, { v: null }, { v: "" }, { v: " " }].forEach((cell) => assert.equal(isBlankCell(cell), true, JSON.stringify(cell)));
  });

  it("does not count a value, a formula or a calculated error", () => {
    [0, false, "x", { v: 0 }, { v: false }, { v: "=A2" }, spreadsheetError("#DIV/0!")].forEach((cell) =>
      assert.equal(isBlankCell(cell), false, JSON.stringify(cell)),
    );
  });
});

const calcRow = (row: unknown[], formula: string, otherSheets: SheetData[] = []): unknown => {
  // normalizeData is how a stored workbook, blank forms and all, reaches the engine.
  const sheet: SheetData = { name: "S", data: normalizeData([[...row, formula].map((v) => (v !== null && typeof v === "object" ? v : { v }))]) };
  return cellAt(new SpreadsheetEngine().calculate(sheet, [sheet, ...otherSheets]).data, 0, row.length);
};

/** `=B1&"x"` with B1 holding `blank`, which sits after the formula and is read before it is calculated. */
const blankAfter = (blank: unknown): unknown =>
  cellAt(new SpreadsheetEngine().calculate({ name: "S", data: normalizeData([[{ v: '=B1&"x"' }, blank, { v: "=B1+1" }]]) }).data, 0, 0);

const joined = (cells: SheetData["data"][number], col: number): unknown => cellAt(new SpreadsheetEngine().calculate({ name: "S", data: [cells] }).data, 0, col);

describe("a blank cell in a & join", () => {
  // A1 blank, B1 = 3
  it("joins as nothing, as in Excel", () => {
    assert.equal(calcRow(["", 3], '=A1&"x"'), "x");
    assert.equal(calcRow(["", 3], "=A1&B1"), "3");
    assert.equal(calcRow(["", 3], '="x"&A1&"y"'), "xy");
    assert.equal(calcRow(["", 3], '=(A1)&"x"'), "x");
  });

  it("still computes as 0", () => {
    assert.equal(calcRow(["", 3], '=A1*2&"x"'), "0x");
    assert.equal(calcRow(["", 3], '="x"&-A1'), "x0");
    assert.equal(calcRow(["", 3], "=A1+1"), 1);
    assert.equal(calcRow(["", 3], "=A1&A1+1"), "1", "the joined A1 is empty, the added one is 0");
  });

  it("joins every form of blank as nothing, before and after the formula", () => {
    [{ v: "" }, { v: null }, {}, null].forEach((blank) => assert.equal(calcRow([blank], '=A1&"x"'), "x", JSON.stringify(blank)));
    [{ v: null }, {}, { v: "" }].forEach((blank) => assert.equal(blankAfter(blank), "x", `${JSON.stringify(blank)} read before it is calculated`));
  });

  it("joins a cell outside the sheet, or on another sheet, the same way", () => {
    assert.equal(calcRow([1], '=Z99&"x"'), "x");
    const other: SheetData = { name: "T", data: [[{ v: "" }, { v: 7 }]] };
    assert.equal(calcRow([1], '=T!A1&"x"', [other]), "x");
    assert.equal(calcRow([1], '=T!B1&"x"', [other]), "7x");
  });

  it("joins a cell whose formula answers nothing as nothing", () => {
    assert.equal(calcRow([{ v: '=""' }], '=A1&"x"'), "x");
  });

  // A formula cell is judged by its answer whether it is calculated before or after the join.
  it("joins a formula's answer the same whichever cell comes first", () => {
    ['=""', '=" "', '="y"', "=0"].forEach((answer) => {
      const after = joined([{ v: '=B1&"x"' }, { v: answer }], 0);
      const before = joined([{ v: answer }, { v: '=A1&"x"' }], 1);
      assert.equal(after, before, answer);
    });
    assert.equal(joined([{ v: '=B1&"x"' }, { v: '="y"' }], 0), "yx");
    assert.equal(joined([{ v: '=B1&"x"' }, { v: "=0" }], 0), "0x");
  });

  it("keeps a value that is not blank", () => {
    assert.equal(calcRow([0], '=A1&"x"'), "0x");
    assert.equal(calcRow([false], '=A1&"x"'), "FALSEx");
    assert.equal(calcRow([{ v: "=1/0" }], '=A1&"x"'), "#DIV/0!", "an error cell is not blank");
  });

  it("compares the joined text", () => {
    assert.equal(calcRow([""], '=A1&"x"="x"'), true);
    assert.equal(calcRow([""], '=A1&"x"="0x"'), false);
  });
});

// Row: A1 blank, B1 = 2, C1 = "t". An operand is written with the text Excel joins for it.
interface JoinedOperand {
  text: string;
  joins: string;
}
const OPERANDS: readonly JoinedOperand[] = [
  { text: "A1", joins: "" },
  { text: "(A1)", joins: "" },
  { text: " A1 ", joins: "" },
  { text: "A1+1", joins: "1" },
  { text: "A1*B1", joins: "0" },
  { text: "-A1", joins: "0" },
  { text: "(A1-B1)", joins: "-2" },
  { text: "B1", joins: "2" },
  { text: "C1", joins: "t" },
  { text: '"q"', joins: "q" },
  { text: "Z9", joins: "" },
];

const GENERATED_CASES = 300;
const baseSeed = Number(process.env.EMPTY_CONCAT_SEED ?? Date.now() % 1_000_000);

describe("& joins over generated operands", () => {
  it(`join a blank as nothing and a computed blank as its number (seed ${baseSeed})`, () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach((_, caseIndex) => {
      const operands = Array.from({ length: 2 + Math.floor(random() * 3) }, () => pick(random, OPERANDS));
      const formula = `=${operands.map((operand) => operand.text).join("&")}`;
      const expected = operands.map((operand) => operand.joins).join("");
      assert.equal(calcRow(["", 2, "t"], formula), expected, `seed ${baseSeed} case ${caseIndex}: ${formula}`);
    });
  });
});
