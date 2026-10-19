// TRUE and FALSE written in a formula are logical values, as a cell holding one is: alone they
// are TRUE, joined with & they are the text TRUE, in arithmetic TRUE is 1, and as a criteria they
// match logical cells only. The generated check writes each formula once with TRUE and once with
// a reference to a cell holding true; rerun one seed with LOGICAL_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { booleansAsNumbers, logicalLiteralsAsBooleans, loneBoolean } from "../../src/engine/logicalLiterals.ts";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import type { SpreadsheetCell } from "../../src/engine/types.ts";
import { cellAt } from "./cellAccess.ts";
import { pick, seededRandom } from "./seededRandom.ts";

describe("logicalLiteralsAsBooleans", () => {
  it("writes TRUE and FALSE, in any case, as the boolean words", () => {
    assert.equal(logicalLiteralsAsBooleans("TRUE"), "true");
    assert.equal(logicalLiteralsAsBooleans("False&2"), "false&2");
    assert.equal(logicalLiteralsAsBooleans("IF(TRUE,1,2)+(FALSE)"), "IF(true,1,2)+(false)");
  });

  it("leaves a call, a sheet name, a longer name, a reference and text in quotes", () => {
    ["TRUE()", "TRUE ()", "TRUE!A1", "'TRUE'!A1", "TRUEX+1", "XTRUE", "A1TRUE", "TRUE1", '"TRUE"&1', '"say ""TRUE"""', "Sheet.TRUE", "$TRUE"].forEach(
      (formula) => assert.equal(logicalLiteralsAsBooleans(formula), formula, formula),
    );
  });
});

describe("loneBoolean and booleansAsNumbers", () => {
  it("reads a boolean written alone, in brackets or not", () => {
    assert.equal(loneBoolean("true"), true);
    assert.equal(loneBoolean(" ((false)) "), false);
    assert.equal(loneBoolean("true+1"), null);
    assert.equal(loneBoolean("truex"), null);
  });

  it("reads TRUE as 1 and FALSE as 0 for arithmetic, unless the expression holds text", () => {
    assert.equal(booleansAsNumbers("true+1"), "1+1");
    assert.equal(booleansAsNumbers("-false*(true)"), "-0*(1)");
    assert.equal(booleansAsNumbers('"true"+1'), '"true"+1');
  });
});

/** Each formula's value, with `cells` in row 1 and the formulas down column A from row 2. */
function valuesOf(cells: SpreadsheetCell[], formulas: string[]): unknown[] {
  const grid = new SpreadsheetEngine().calculate({ name: "S", data: [cells, ...formulas.map((formula) => [{ v: formula }])] } satisfies SheetData).data;
  return formulas.map((_, index) => cellAt(grid, index + 1, 0));
}

describe("TRUE and FALSE in a formula", () => {
  it("answers the formulas of #91 as Excel does", () => {
    assert.deepEqual(valuesOf([], ["=FALSE&2", '=TRUE&"a"', "=TRUE+1", "=true&2"]), ["FALSE2", "TRUEa", 2, "TRUE2"]);
  });

  it("answers the formulas of #109 as Excel does", () => {
    const cells: SpreadsheetCell[] = [{ v: true }, { v: "TRUE" }, { v: false }];
    assert.deepEqual(valuesOf(cells, ["=TRUE", "=TRUE()", "=COUNTIF(A1:C1,TRUE)", "=COUNTIF(A1:C1,TRUE())"]), [true, true, 1, 1]);
  });

  it("reads TRUE as 1 in arithmetic and keeps it logical alone or in brackets", () => {
    assert.deepEqual(valuesOf([], ["=TRUE*2", "=-TRUE", "=1+TRUE*2", "=TRUE+TRUE", "=(FALSE)", "=FALSE/1", "=TRUE/FALSE"]), [2, -1, 3, 2, false, 0, "#DIV/0!"]);
  });

  it("writes a logical value as TRUE or FALSE in text", () => {
    assert.deepEqual(valuesOf([{ v: true }], ["=CONCATENATE(TRUE,1)", "=CONCATENATE(A1,FALSE)", "=LEN(TRUE)", "=UPPER(FALSE)", '=EXACT(TRUE,"TRUE")']), [
      "TRUE1",
      "TRUEFALSE",
      4,
      "FALSE",
      true,
    ]);
  });

  it("leaves text that spells TRUE as text", () => {
    assert.deepEqual(valuesOf([], ['="TRUE"', '="TRUE"&1', '=LEN("FALSE")']), ["TRUE", "TRUE1", 5]);
  });
});

const baseSeed = Number(process.env.LOGICAL_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 300;
// Each template takes a logical operand: the written word, or a reference to a cell holding it.
const TEMPLATES: ((operand: string) => string)[] = [
  (x) => `=${x}`,
  (x) => `=(${x})`,
  (x) => `=${x}+1`,
  (x) => `=2*${x}-1`,
  (x) => `=-${x}`,
  (x) => `=${x}&"|"`,
  (x) => `="|"&${x}`,
  (x) => `=${x}&${x}`,
  (x) => `=IF(${x},"y","n")`,
  (x) => `=NOT(${x})`,
  (x) => `=AND(${x},TRUE)`,
  (x) => `=${x}=TRUE`,
  (x) => `=${x}<>FALSE`,
  (x) => `=CONCATENATE(${x},"|")`,
  (x) => `=LEN(${x})`,
  (x) => `=COUNTIF(B1:D1,${x})`,
  (x) => `=IFERROR(${x}/1,"e")`,
];

describe(`TRUE written or referenced (seed ${baseSeed})`, () => {
  it("answers alike whether the logical value is written or read from a cell", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const value = random() < 0.5;
      const template = pick(random, TEMPLATES);
      const word = pick(random, value ? ["TRUE", "true", "True"] : ["FALSE", "false", "False"]);
      const cells: SpreadsheetCell[] = [{ v: value }, { v: true }, { v: "TRUE" }, { v: false }];
      const [written, referenced] = valuesOf(cells, [template(word), template("A1")]);
      assert.deepEqual(written, referenced, `seed ${baseSeed}: ${template(word)} vs ${template("A1")}`);
    });
  });
});
