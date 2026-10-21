// A bracketed part of a formula is a value of its own, as a call is (#94), and text in arithmetic
// reads as Excel reads it: text that is a number is that number, any other text is #VALUE! (#92).
// The generated checks write the same arithmetic with a number and with text, and the same
// comparison inside and outside brackets; rerun one seed with GROUPS_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { textOperandsAsNumbers } from "../../src/engine/textArithmetic.ts";
import { VALUE_ERROR } from "../../src/engine/spreadsheet-errors.ts";
import type { SpreadsheetCell } from "../../src/engine/types.ts";
import { pick, seededRandom } from "./seededRandom.ts";
import { valuesBesideCells } from "./formulaColumns.ts";

describe("textOperandsAsNumbers", () => {
  it("reads text beside an arithmetic operator as its number", () => {
    assert.equal(textOperandsAsNumbers('"3"+1'), "(3)+1");
    assert.equal(textOperandsAsNumbers('2*"1,000"'), "2*(1000)");
    assert.equal(textOperandsAsNumbers('-"5%"'), "-(0.05)");
    assert.equal(textOperandsAsNumbers('1+"2"^2'), "1+(2)^2");
  });

  it("is #VALUE! for text beside an arithmetic operator that is not a number", () => {
    ['"a"+1', '1-"a"', '0*"a1"', '"x"/12', '-""', '" "*2'].forEach((expr) => assert.equal(textOperandsAsNumbers(expr), VALUE_ERROR, expr));
  });

  it("leaves text beside & or a comparison, or alone, as written", () => {
    ['"a"&1', '"a"="b"', '"3"<"4"', '"a"', '"x"&"y"&2', '("a")'].forEach((expr) => assert.equal(textOperandsAsNumbers(expr), expr, expr));
  });

  it("reads past an escaped quote and an emoji to the operator", () => {
    assert.equal(textOperandsAsNumbers('"say \\"hi\\""+1'), VALUE_ERROR);
    assert.equal(textOperandsAsNumbers('"😀"&"3"+1'), '"😀"&(3)+1');
  });
});

// A1 holds "abc", A2 holds "3", A3 holds TRUE, A4 is blank; the formulas go down column B.
const CELLS: SpreadsheetCell[] = [{ v: "abc" }, { v: "3" }, { v: true }, { v: "" }];

const valuesOf = (formulas: string[]): unknown[] => valuesBesideCells(formulas, CELLS);

describe("a bracketed part (#94)", () => {
  it("answers the issue's formulas as Excel does", () => {
    assert.deepEqual(valuesOf(['=("a"="b")&"x"', '=(1<2)&"x"', '=("a")']), ["FALSEx", "TRUEx", "a"]);
  });

  it("is its value in arithmetic, joining and comparing", () => {
    assert.deepEqual(valuesOf(["=(1=1)+1", '=("a"&"b")="ab"', "=(2+3)*4", '=IF((1<2),"y","n")', '=("1"&"2")+1']), [2, true, 20, "y", 13]);
  });

  it("leaves a bracket right after a name as written, malformed", () => {
    assert.deepEqual(valuesOf(["=A2(2)", "=1+A2(3)"]), ["#ERROR!", "#ERROR!"]);
  });

  it("leaves a reference alone in brackets to be read as a blank or a value", () => {
    assert.deepEqual(valuesOf(['=(A4)=""', "=(A4)=0", '=(A1)&"!"']), [true, true, "abc!"]);
  });
});

describe("text in arithmetic (#92)", () => {
  it("answers the issue's formulas as Excel does", () => {
    assert.deepEqual(valuesOf(['=0*("a"&1)', '=("a"&1)+1', '="x"/12&12']), ["#VALUE!", "#VALUE!", "#VALUE!"]);
  });

  it("reads text that is a number, written or in a cell, as that number", () => {
    assert.deepEqual(valuesOf(['="3"+1', "=A2*2", '=-"2"', '="1,000"/10', '="50%"*2']), [4, 6, -2, 100, 1]);
  });

  it("is #VALUE! for other text, written or in a cell", () => {
    assert.deepEqual(valuesOf(['="a"+1', "=A1*2", '=-"a"', '=1+""', "=A1^2"]), ["#VALUE!", "#VALUE!", "#VALUE!", "#VALUE!", "#VALUE!"]);
  });

  it("leaves joining and comparing text as they were", () => {
    assert.deepEqual(valuesOf(['="a"&1+2', '="3"="3"', "=A1&A2"]), ["a3", true, "abc3"]);
  });
});

const baseSeed = Number(process.env.GROUPS_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 200;
// Text, and the number Excel reads it as in arithmetic (null: #VALUE!).
const TEXTS: [string, number | null][] = [
  ['"3"', 3],
  ['"-1.5"', -1.5],
  ['"2,000"', 2000],
  ['"25%"', 0.25],
  ['"abc"', null],
  ['""', null],
  ['"x1"', null],
];
const ARITHMETIC: ((x: string) => string)[] = [(x) => `${x}+1`, (x) => `2*${x}`, (x) => `${x}/4`, (x) => `-${x}`, (x) => `1-${x}*3`, (x) => `(${x})+1`];

describe(`arithmetic and brackets over generated operands (seed ${baseSeed})`, () => {
  it("reads text in arithmetic as the number it is, or answers #VALUE!", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const [text, number] = pick(random, TEXTS);
      const template = pick(random, ARITHMETIC);
      const [withText, withNumber] = valuesOf([`=${template(text)}`, `=${template(String(number ?? 0))}`]);
      assert.deepEqual(withText, number === null ? "#VALUE!" : withNumber, `seed ${baseSeed}: =${template(text)}`);
    });
  });

  it("joins a bracketed comparison as its logical value", () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const comparison = `${pick(random, ["1", "2", '"a"', '"b"', "A2", "A3"])}${pick(random, ["=", "<>", "<", ">="])}${pick(random, ["1", "2", '"a"', '"B"', "A1"])}`;
      const [joined, spelled] = valuesOf([`=(${comparison})&"|"`, `=IF(${comparison},"TRUE","FALSE")&"|"`]);
      assert.equal(joined, spelled, `seed ${baseSeed}: (${comparison})`);
    });
  });
});
