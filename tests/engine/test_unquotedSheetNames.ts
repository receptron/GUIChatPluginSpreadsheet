// A sheet named in Japanese, or with `_` or `.`, written without quotes (`=基準!B1`), as Excel
// accepts it (#136). It used to read B1 of the CURRENT sheet and leave `基準!` in front as text.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateSheet, type SheetData } from "../../src/engine/index.ts";
import { findCellRefs } from "../../src/engine/evaluator.ts";

const calculated = (name: string, formulas: string[]): unknown[] => {
  const here: SheetData = { name: "Here", data: [["here", 5, ...formulas].map((v) => ({ v }))] };
  const there: SheetData = { name, data: [[{ v: "there" }, { v: 45929 }, { v: 7 }]] };
  return calculateSheet(here, [here, there], { skipFormatting: true }).data[0]?.slice(2) ?? [];
};

describe("an unquoted sheet name outside A-Z and digits (#136)", () => {
  for (const name of ["基準", "データ2023", "Sheet_1", "q1.data", "Ünits"]) {
    it(`reads ${name}!B1 from that sheet`, () => {
      assert.deepEqual(calculated(name, [`=${name}!B1`, `=${name}!$B$1+1`, `=${name}!C1*2`, `=SUM(${name}!B1:C1)`]), [45929, 45930, 14, 45936]);
    });
  }

  it("is #REF! when no sheet has that name, as an ASCII name is", () => {
    assert.deepEqual(calculated("基準", ["=見当たらない!B1", "=Missing!B1"]).map(String), ["#REF!", "#REF!"]);
  });

  it("reads a whole column of that sheet, as a cell of it is read", () => {
    assert.deepEqual(calculated("基準", ["=SUM(基準!B:C)"]), [45936]);
    assert.deepEqual(calculated("Sheet_1", ["=COUNT(Sheet_1!B:B)"]), [1]);
  });

  it("reads a name that begins with TRUE or FALSE as a sheet, not as a logical value", () => {
    assert.deepEqual(calculated("TRUEデータ", ["=TRUEデータ!B1", "=FALSE集計!B1"]).map(String), ["45929", "#REF!"]);
  });

  // Guards, not regressions: these already worked and must keep working.
  it("still reads a quoted name and a name starting with a digit only when quoted", () => {
    assert.deepEqual(calculated("2024年", ["='2024年'!B1"]), [45929]);
  });

  it("does not take a word before a string, a function or an operator as a sheet", () => {
    assert.deepEqual(
      findCellRefs('=基準&"!B1"&IF(B1>0,データ!C1,A1)').map((span) => span.ref),
      ["B1", "データ!C1", "A1"],
    );
  });
});
