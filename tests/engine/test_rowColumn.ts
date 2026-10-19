// ROW / COLUMN / ROWS / COLUMNS (#137). `=ROW()-1` numbering a data sheet is how an analysis
// workbook gets its period index; it gave #NAME?, which spread to every SLOPE that read it.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateSheet, evaluateFormula, type SheetData } from "../../src/engine/index.ts";

const valuesOf = (sheet: SheetData, all: SheetData[] = [sheet]): unknown[][] => calculateSheet(sheet, all, { skipFormatting: true }).data;

describe("ROW and COLUMN", () => {
  it("answer for the cell the formula is in", () => {
    const sheet: SheetData = {
      name: "S",
      data: [
        [{ v: "=ROW()" }, { v: "=COLUMN()" }],
        [{ v: 0 }, { v: 0 }, { v: "=ROW()*10+COLUMN()" }],
      ],
    };
    assert.deepEqual(valuesOf(sheet), [
      [1, 2],
      [0, 0, 23],
    ]);
  });

  it("answer for the formula's own cell before and after it calculates another one", () => {
    const sheet: SheetData = { name: "S", data: [[{ v: "=SUM(A3)*100+ROW()" }], [{ v: 0 }], [{ v: "=ROW()" }]] };
    assert.deepEqual(valuesOf(sheet), [[301], [0], [3]]);
  });

  it("answer for the formula's own sheet and cell when another sheet reads it", () => {
    const data: SheetData = { name: "Data", data: [[{ v: "x" }], [{ v: "x" }], [{ v: "=ROW()-1" }]] };
    const summary: SheetData = { name: "Summary", data: [[{ v: "=Data!A3*10+ROW()" }]] };
    assert.deepEqual(valuesOf(summary, [data, summary]), [[21]]);
  });

  it("number a data column that SLOPE then reads", () => {
    const rows = [5, 7, 9, 11].map((sales) => [{ v: "=ROW()-1" }, { v: sales }]);
    const sheet: SheetData = { name: "S", data: [[{ v: "period" }, { v: "sales" }], ...rows, [{ v: "=SLOPE(B2:B5,A2:A5)" }]] };
    assert.equal(valuesOf(sheet)[5]?.[0], 2);
  });

  it("read a reference's first cell, on any sheet, `$` or not", () => {
    const sheet: SheetData = {
      name: "S",
      data: [["=ROW(C10)", "=COLUMN(D3)", "=ROW(Data!$B$7)", "=COLUMN('My Sheet'!AA1)", "=ROW(B4:D9)", "=COLUMN(B4:D9)"].map((v) => ({ v }))],
    };
    assert.deepEqual(valuesOf(sheet)[0], [10, 4, 7, 27, 4, 2]);
  });

  it("are #VALUE! for an argument that is not a reference", () => {
    const sheet: SheetData = { name: "S", data: [['=ROW("x")', "=COLUMN(1)"].map((v) => ({ v }))] };
    assert.deepEqual(valuesOf(sheet)[0]?.map(String), ["#VALUE!", "#VALUE!"]);
  });

  it("without a reference, are #VALUE! outside a sheet, where there is no cell", () => {
    const outside = { getCellValue: () => 0, getRangeValues: () => [], evaluateFormula: (formula: string) => evaluateFormula(formula, outside) };
    assert.equal(String(evaluateFormula("ROW()", outside)), "#VALUE!");
  });
});

describe("ROWS and COLUMNS", () => {
  it("count a range's rows and columns", () => {
    const sheet: SheetData = { name: "S", data: [["=ROWS(A2:C10)", "=COLUMNS(A2:C10)", "=ROWS(B3)", "=COLUMNS(Data!A1:E1)"].map((v) => ({ v }))] };
    assert.deepEqual(valuesOf(sheet)[0], [9, 3, 1, 5]);
  });

  it("are #VALUE! for an argument that is not a reference", () => {
    const sheet: SheetData = { name: "S", data: [['=ROWS("A1:B2")'].map((v) => ({ v }))] };
    assert.deepEqual(valuesOf(sheet)[0]?.map(String), ["#VALUE!"]);
  });
});
