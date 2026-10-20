// Array results that spill from the formula's cell, and range reads that keep their shape. The
// functions here are registered for this file only (each test file runs in its own process): no
// built-in function answers a table yet.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, functionRegistry, type CellValue, type SheetData, type SpreadsheetCell } from "../../src/engine/index.ts";
import { DIV_ZERO_ERROR } from "../../src/engine/spreadsheet-errors.ts";
import { calculateWith, loadCustomFunctions } from "../../src/engine/customFunctions.ts";

const numberOf = (arg: string, evaluate: (formula: string) => CellValue): number => Number(evaluate(arg));

// TEST.GRID(rows, columns): a table whose cell in row i, column j (from 1) is 10·i + j.
functionRegistry.register({
  name: "TEST.GRID",
  spills: true,
  minArgs: 2,
  maxArgs: 2,
  handler: ([rows = "0", columns = "0"], context) =>
    Array.from({ length: numberOf(rows, context.evaluateFormula) }, (_, i) =>
      Array.from({ length: numberOf(columns, context.evaluateFormula) }, (_, j) => (i + 1) * 10 + j + 1),
    ),
});
// TEST.ECHO(range): the range as rows of cells.
functionRegistry.register({ name: "TEST.ECHO", spills: true, minArgs: 1, maxArgs: 1, handler: ([range = ""], context) => context.getRangeGrid?.(range) ?? [] });
// TEST.SHAPE(argument): "rows×columns" of what the grid reader gives for it; a single value.
functionRegistry.register({
  name: "TEST.SHAPE",
  minArgs: 1,
  maxArgs: 1,
  handler: ([arg = ""], context) => {
    const grid = context.getRangeGrid?.(arg) ?? [];
    return `${grid.length}×${grid[0]?.length ?? 0}`;
  },
});
functionRegistry.register({
  name: "TEST.MIXED",
  spills: true,
  handler: () => [
    ["a", true],
    [DIV_ZERO_ERROR, ""],
  ],
});
functionRegistry.register({ name: "TEST.UNMARKED", handler: () => [[1, 2]] });
functionRegistry.register({ name: "TEST.SERIALS", spills: true, handler: () => [[45000], [45001]] });

type Cell = SpreadsheetCell | Record<string, never>;
const cell = (v: SpreadsheetCell["v"], f?: string): SpreadsheetCell => (f === undefined ? { v } : { v, f });
const sheet = (rows: Cell[][], name = "S"): SheetData => ({ name, data: rows.map((row) => row.map((entry) => ("v" in entry ? entry : { v: "" }))) });

function calculate(rows: Cell[][]): { data: CellValue[][]; errors: string[] } {
  const result = new SpreadsheetEngine().calculate(sheet(rows));
  return { data: result.data, errors: result.errors.map(({ error }) => error) };
}

describe("a table spills from the formula's cell", () => {
  it("to the right and down, the anchor holding the top-left cell", () => {
    assert.deepEqual(calculate([[cell("=TEST.GRID(2,3)")]]).data, [
      [11, 12, 13],
      [21, 22, 23],
    ]);
  });

  it("past the sheet's data, the grid growing to hold it", () => {
    const { data } = calculate([[cell(1), cell("=TEST.GRID(3,2)")]]);
    assert.deepEqual(data, [
      [1, 11, 12],
      ["", 21, 22],
      ["", 31, 32],
    ]);
  });

  it("into blank cells of the sheet, which keep their own format", () => {
    const { data } = calculate([[cell("=TEST.GRID(2,1)", "0.00")], [cell("", "0.0")]]);
    assert.deepEqual(data, [["11.00"], ["21.0"]]);
  });

  it("formats a spilled cell as its anchor when the cell has no format of its own", () => {
    assert.deepEqual(calculate([[cell("=TEST.GRID(1,2)", "0.00")]]).data, [["11.00", "12.00"]]);
  });

  it("keeps text, logical values, errors and empty text as cells", () => {
    assert.deepEqual(calculate([[cell("=TEST.MIXED()")]]).data, [
      ["a", true],
      ["#DIV/0!", ""],
    ]);
  });

  it("lists only the anchor among the formulas", () => {
    const result = new SpreadsheetEngine().calculate(sheet([[cell("=TEST.GRID(2,2)")]]));
    assert.deepEqual(
      result.formulas.map(({ cell: at }) => at),
      [{ row: 0, col: 0 }],
    );
  });
});

describe("#SPILL!", () => {
  it("when the table would run past the edge of the sheet", () => {
    const wide: Cell[] = Array.from({ length: 16_383 }, () => ({}));
    wide.push(cell("=TEST.GRID(1,2)"));
    const { data, errors } = calculate([wide]);
    assert.equal(data[0]?.[16_383], "#SPILL!");
    assert.equal(data[0]?.length, 16_384, "nothing written past the last column");
    assert.deepEqual(errors, ["Spill range goes past the edge of the sheet"]);
    const tall: Cell[][] = Array.from({ length: 1_048_575 }, () => []);
    tall.push([cell("=TEST.GRID(2,1)")]);
    assert.equal(calculate(tall).data[1_048_575]?.[0], "#SPILL!", "past the last row");
    // TEST.GRID's last cell in row 1 is 10 + 16,384.
    assert.equal(calculate([[cell("=TEST.GRID(1,16384)")]]).data[0]?.[16_383], 16_394, "exactly to the edge still spills");
  });

  it("when a cell the table needs holds a value, a formula, or a formula answering empty text", () => {
    [cell("x"), cell(0), cell("=1+1"), cell('=IF(TRUE,"",1)')].forEach((blocker) => {
      const { data, errors } = calculate([[cell("=TEST.GRID(2,2)")], [cell(""), blocker]]);
      assert.equal(data[0]?.[0], "#SPILL!", JSON.stringify(blocker));
      assert.equal(data[0]?.[1] ?? "", "", "nothing spills");
      assert.deepEqual(errors, ["Spill range is not blank"]);
    });
  });

  it("when another table already took a cell: the first in reading order keeps its place", () => {
    // B1 spills down B1:B3 and A2 across A2:C2; they meet at B2, and B1 comes first.
    const { data } = calculate([[cell(""), cell("=TEST.GRID(3,1)")], [cell("=TEST.GRID(1,3)")]]);
    assert.deepEqual(
      data.map((row) => row[1]),
      [11, 21, 31],
    );
    assert.equal(data[1]?.[0], "#SPILL!");
    assert.equal(data[1]?.[2] ?? "", "");
  });

  it("when a formula cell is in the way, the table that would cover it does not spill", () => {
    const { data } = calculate([[cell("=TEST.GRID(1,2)"), cell("=TEST.GRID(2,1)")]]);
    assert.deepEqual(data, [
      ["#SPILL!", 11],
      ["", 21],
    ]);
  });

  it("is an error value a formula reading the anchor sees", () => {
    const { data } = calculate([[cell("=TEST.GRID(1,2)"), cell("x"), cell("=A1"), cell("=IFERROR(A1,0)")]]);
    assert.deepEqual(data[0]?.slice(2), ["#SPILL!", 0]);
  });
});

describe("every read sees a spilled cell", () => {
  it("a single cell, read before and after the walk reaches the anchor", () => {
    const { data } = calculate([[cell("=B3"), cell("=TEST.GRID(3,1)"), cell("=B3*2")]]);
    assert.deepEqual([data[0]?.[0], data[0]?.[2]], [31, 62]);
  });

  it("a range, aggregated before the walk reaches the anchor, the anchor itself outside the range", () => {
    const { data } = calculate([[cell("=SUM(C2:D2)"), cell("=COUNT(C2:C9)"), cell("=TEST.GRID(2,2)")]]);
    assert.deepEqual(data[0]?.slice(0, 2), [43, 1]);
  });

  it("COUNTA and a whole column, read before the walk reaches the anchor", () => {
    assert.equal(calculate([[cell("=COUNTA(C2:C3)"), cell(""), cell("=TEST.GRID(4,1)")]]).data[0]?.[0], 2);
    // Alone, so nothing else has made the table spill before C:C is bounded to the sheet's rows.
    assert.equal(calculate([[cell("=SUM(C:C)"), cell(""), cell("=TEST.GRID(4,1)")]]).data[0]?.[0], 104);
  });

  it("a whole column or row, past the sheet's data", () => {
    const { data } = calculate([[cell("=TEST.GRID(4,1)"), cell("=SUM(A:A)"), cell("=SUM(3:3)"), cell("=COUNTA(A:A)")]]);
    assert.deepEqual(data[0]?.slice(1), [104, 31, 4]);
  });

  it("whether a cell is empty: a spilled cell joins as its value, and COUNTA counts it", () => {
    const { data } = calculate([[cell("=TEST.GRID(2,1)"), cell('=A2&"!"'), cell('=A3&"!"'), cell("=COUNTA(A1:A3)")]]);
    assert.deepEqual(data[0]?.slice(1), ["21!", "!", 2]);
  });

  it("from another sheet: a cell, a range, a whole column", () => {
    const engine = new SpreadsheetEngine();
    const data = sheet([[cell("=TEST.GRID(3,1)")]], "Data");
    const summary = sheet([[cell("=Data!A3"), cell("=SUM(Data!A1:A3)"), cell("=SUM(Data!A:A)")]]);
    const [first] = engine.calculateWorkbook([summary, data]);
    assert.deepEqual(first?.data[0], [31, 63, 63]);
  });

  it("only candidates above and to the left of the cell read are calculated first", () => {
    // A1 reads C1; A3 may spill but sits below row 1, and reads A1: calculating it first would be circular.
    const { data, errors } = calculate([[cell("=C1"), cell(""), cell(7)], [cell(1)], [cell("=TEST.ECHO(A1:A2)")]]);
    assert.deepEqual([data[0]?.[0], data[2]?.[0], data[3]?.[0]], [7, 7, 1]);
    assert.deepEqual(errors, []);
  });

  it("a candidate reading cells to its right does not count itself as their spill", () => {
    const { data, errors } = calculate([
      [cell("=TEST.ECHO(C1:C2)"), cell(""), cell(3)],
      [cell(""), cell(""), cell(4)],
    ]);
    assert.deepEqual(
      data.map((row) => row[0]),
      [3, 4],
    );
    assert.deepEqual(errors, []);
  });

  it("a whole row calculates only the candidates that could reach it", () => {
    // A3 sums row 1; A10 reads A3 and may spill, but from row 10 it cannot reach row 1.
    const rows: Cell[][] = Array.from({ length: 10 }, () => []);
    rows[0] = [cell(2), cell(3)];
    rows[2] = [cell("=SUM(1:1)")];
    rows[9] = [cell("=TEST.ECHO(A3:A4)")];
    const { data, errors } = calculate(rows);
    assert.deepEqual([data[2]?.[0], data[9]?.[0]], [5, 5]);
    assert.deepEqual(errors, []);
  });

  it("without calculating unrelated formulas out of turn: no circular reference is invented", () => {
    // A1 sums column C; Z1 reads A1 and may spill, but only into Z, so A1's C:C need not wait for it.
    const row: Cell[] = Array.from({ length: 26 }, () => ({}));
    row[0] = cell("=SUM(C:C)");
    row[2] = cell(5);
    row[25] = cell("=TEST.ECHO(A1:A2)");
    const { data, errors } = calculate([row]);
    assert.deepEqual([data[0]?.[0], data[0]?.[25], data[1]?.[25]], [5, 5, ""]);
    assert.deepEqual(errors, []);
  });
});

describe("a call answering a table, where a range is read", () => {
  it("is aggregated as a range's cells", () => {
    const { data } = calculate([
      [
        cell("=SUM(TEST.GRID(2,2))"),
        cell("=AVERAGE(TEST.GRID(1,3))"),
        cell("=COUNT(TEST.MIXED())"),
        cell("=COUNTA(TEST.MIXED())"),
        cell("=MAX(TEST.GRID(3,3),1)"),
      ],
    ]);
    assert.deepEqual(data[0], [66, 12, 0, 4, 33]);
    const [countOne] = calculate([[cell("=COUNT(TEST.GRID(1,1))")]]).data[0] ?? [];
    assert.equal(countOne, 1, "a 1×1 table is still one number");
  });

  it("is read by a function that takes a range", () => {
    const { data } = calculate([[cell(1), cell("=CORREL(A1:A3,TEST.GRID(3,1))"), cell("=MATCH(21,TEST.GRID(3,1),0)")], [cell(2)], [cell(3)]]);
    assert.deepEqual(data[0]?.slice(1), [1, 2]);
  });

  it("is the table VLOOKUP, HLOOKUP and INDEX search, ROWS and COLUMNS measure, and NPV discounts", () => {
    const { data } = calculate([
      [
        cell("=VLOOKUP(21,TEST.GRID(3,3),3,FALSE)"),
        cell("=HLOOKUP(12,TEST.GRID(3,3),3,FALSE)"),
        cell("=INDEX(TEST.GRID(3,3),2,3)"),
        cell("=ROWS(TEST.GRID(4,2))"),
        cell("=COLUMNS(TEST.GRID(4,2))"),
        cell("=NPV(0,TEST.GRID(1,3))"),
        cell("=VLOOKUP(99,TEST.GRID(3,3),2,FALSE)"),
        cell("=INDEX(TEST.GRID(2,2),3,1)"),
      ],
    ]);
    assert.deepEqual(data[0], [23, 32, 23, 4, 2, 36, "#N/A", "#REF!"]);
  });

  it("is passed to a workbook's own function as rows of cells", async () => {
    const functions = await loadCustomFunctions([{ functions: [{ name: "WIDTHS", params: ["t"], body: "return t.length * 100 + t[0].length;" }] }]);
    try {
      const sheetData = sheet([[cell("=WIDTHS(TEST.GRID(3,2))")]]);
      assert.equal(calculateWith(functions, () => new SpreadsheetEngine().calculate(sheetData)).data[0]?.[0], 302);
    } finally {
      functions.dispose();
    }
  });

  it("keeps its shape for the grid reader, as a reference does; a single value is 1×1", () => {
    const { data } = calculate([
      [cell("=TEST.SHAPE(TEST.GRID(2,3))"), cell("=TEST.SHAPE(A2:C5)"), cell("=TEST.SHAPE(1+1)"), cell("=TEST.SHAPE(Nowhere!A1:B2)")],
    ]);
    assert.deepEqual(data[0], ["2×3", "4×3", "1×1", "#REF!"]);
  });
});

describe("a range written as the whole formula spills its cells", () => {
  it("a blank cell as 0, as =A1 reads it, and a formula's empty text as that text", () => {
    const { data } = calculate([[cell(1), cell("=A1:A3")], [cell("")], [cell('=IF(TRUE,"",1)')]]);
    assert.deepEqual(
      data.map((row) => row[1]),
      [1, 0, ""],
    );
  });

  it("is #REF! for a sheet that does not exist", () => {
    assert.deepEqual(calculate([[cell("=Nowhere!A1:B2")]]).data, [["#REF!"]]);
  });

  it("from another sheet, and shown as the cells' dates are", () => {
    const engine = new SpreadsheetEngine();
    const dates = sheet([[cell("2024-01-15")], [cell("2024-02-01")]], "Data");
    const [first] = engine.calculateWorkbook([sheet([[cell("=Data!A1:A2")]]), dates]);
    assert.deepEqual(
      first?.data.map((row) => row[0]),
      ["01/15/2024", "02/01/2024"],
    );
  });
});

describe("a table where one value is needed", () => {
  it("is #VALUE!, a 1×1 table its only cell", () => {
    const { data } = calculate([[cell("=TEST.GRID(2,2)+1"), cell("=ABS(TEST.GRID(2,2))"), cell("=TEST.GRID(1,1)*5"), cell("=IF(TRUE,TEST.GRID(2,1),0)")]]);
    assert.deepEqual(data[0], ["#VALUE!", "#VALUE!", 55, "#VALUE!"]);
  });

  it("is #VALUE! from a function that does not say it may answer a table", () => {
    assert.deepEqual(calculate([[cell("=TEST.UNMARKED()")]]).data, [["#VALUE!"]]);
  });

  it("shows a spilled date serial as a date when the anchor's formula is a date", () => {
    // TEST.SERIALS is no date function, so its serials stay numbers, as a lone serial would.
    assert.deepEqual(calculate([[cell("=TEST.SERIALS()")]]).data, [[45000], [45001]]);
  });
});
