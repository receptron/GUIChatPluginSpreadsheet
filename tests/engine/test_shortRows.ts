// A cell a row does not reach — past the end of a short row, or below the last row — reads as a
// blank cell. A range that skipped it came out short, and every row after it paired with the
// wrong one. The generated check compares each sheet with the same sheet written out in full
// (every missing cell written as an empty `{ v: "" }`); rerun one seed with SHORT_ROWS_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import type { SpreadsheetCell } from "../../src/engine/types.ts";
import { cellAt } from "./cellAccess.ts";
import { pick, seededRandom, type Random } from "./seededRandom.ts";

type Row = SpreadsheetCell[];

/** The formulas' values, from a sheet "F" that reads the sheet "Data". */
function formulaValues(dataRows: Row[], formulas: string[]): unknown[] {
  const sheets: SheetData[] = [
    { name: "Data", data: dataRows },
    { name: "F", data: formulas.map((formula) => [{ v: formula }]) },
  ];
  const calculated = new SpreadsheetEngine().calculateWorkbook(sheets)[1];
  assert.ok(calculated, "the formula sheet is calculated");
  return formulas.map((_, row) => cellAt(calculated.data, row, 0));
}

describe("a row that stops before the range does", () => {
  // Row 2 has only its A cell, as in the issue.
  const shortRow: Row[] = [[{ v: "East" }, { v: 10 }, { v: 1 }], [{ v: "West" }], [{ v: "East" }, { v: 30 }, { v: 3 }], [{ v: "West" }, { v: 40 }, { v: 5 }]];

  it("keeps the rows paired in the conditional aggregates", () => {
    assert.deepEqual(
      formulaValues(shortRow, [
        '=SUMIF(Data!A1:A4,"East",Data!B1:B4)',
        '=AVERAGEIF(Data!A1:A4,"East",Data!B1:B4)',
        '=SUMIFS(Data!B1:B4,Data!A1:A4,"East")',
        '=COUNTIFS(Data!A1:A4,"East",Data!B1:B4,">0")',
      ]),
      [40, 20, 40, 2],
    );
  });

  it("drops the short row from a pairing, as an empty cell is dropped", () => {
    const [short, compact] = formulaValues(shortRow, ["=CORREL(Data!A1:A4,Data!B1:B4)", "=CORREL(Data!C1:C4,Data!B1:B4)"]);
    assert.equal(short, "#DIV/0!", "the A column holds no number, so nothing pairs");
    assert.equal(typeof compact, "number");
  });

  it("reads a range that runs past the last row as blank cells", () => {
    assert.deepEqual(formulaValues(shortRow, ['=SUMIF(Data!A3:A6,"East",Data!B1:B4)', '=COUNTIF(Data!A1:A6,"")', "=INDEX(Data!B1:B6,6)"]), [10, 2, 0]);
  });
});

// Each data cell is one of these.
const CELL_VALUES: SpreadsheetCell[] = [
  { v: 1 },
  { v: 2 },
  { v: 5 },
  { v: -3 },
  { v: 0 },
  { v: "a" },
  { v: "b" },
  { v: "" },
  {},
  { v: "=1+1" },
  { v: '=IF(TRUE,"",1)' },
];
const CRITERIA = ['">0"', '"a"', '""', '"<>"', '"<3"', "2"];
const COLUMNS = ["A", "B", "C", "D"];
const ROWS = 6;
const RANGE_END = ROWS + 2;

/** A range of one column and `height` rows from `top`, possibly past the last row. */
const columnRange = (random: Random, column: string, top: number, height: number): string => `Data!${column}${top}:${column}${top + height - 1}`;

function generatedFormula(random: Random): string {
  const height = 1 + Math.floor(random() * (RANGE_END - 1));
  const [top, otherTop] = [1 + Math.floor(random() * (RANGE_END - height)), 1 + Math.floor(random() * (RANGE_END - height))];
  const first = columnRange(random, pick(random, COLUMNS), top, height);
  const second = columnRange(random, pick(random, COLUMNS), random() < 0.5 ? top : otherTop, height);
  const criteria = pick(random, CRITERIA);
  return pick(random, [
    `=SUMIF(${first},${criteria},${second})`,
    `=AVERAGEIF(${first},${criteria},${second})`,
    `=SUMIFS(${second},${first},${criteria})`,
    `=COUNTIFS(${first},${criteria},${second},${pick(random, CRITERIA)})`,
    `=AVERAGEIFS(${second},${first},${criteria})`,
    `=COUNTIF(${first},${criteria})`,
    `=CORREL(${first},${second})`,
    `=SLOPE(${first},${second})`,
    `=INDEX(${first},${1 + Math.floor(random() * height)})`,
    `=MATCH(2,${first},0)`,
    `=COUNTA(${first})`,
    `=SUM(${first})`,
    `=AVERAGE(${first})`,
    `=MEDIAN(${first})`,
    `=MAX(${first})`,
  ]);
}

/** A sheet whose rows each stop at a random column, and the same sheet with every missing cell written empty. */
function generatedSheets(random: Random): { short: Row[]; full: Row[] } {
  const full = Array.from({ length: ROWS }, () => COLUMNS.map(() => pick(random, CELL_VALUES)));
  const short = full.map((row) => {
    const length = random() < 0.5 ? row.length : Math.floor(random() * row.length);
    return row.slice(0, length);
  });
  const written = short.map((row) => COLUMNS.map((_, col) => row[col] ?? { v: "" }));
  return { short, full: written };
}

const baseSeed = Number(process.env.SHORT_ROWS_SEED ?? Date.now() % 1_000_000);
const GENERATED_SHEETS = 150;
const FORMULAS_PER_SHEET = 12;

describe(`short rows over generated sheets (seed ${baseSeed})`, () => {
  it("answers every formula as it does when the missing cells are written empty", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_SHEETS }).forEach((_, index) => {
      const { short, full } = generatedSheets(random);
      const formulas = Array.from({ length: FORMULAS_PER_SHEET }, () => generatedFormula(random));
      const [fromShort, fromFull] = [formulaValues(short, formulas), formulaValues(full, formulas)];
      formulas.forEach((formula, row) =>
        assert.deepEqual(fromShort[row], fromFull[row], `seed ${baseSeed} sheet ${index}: ${formula} over ${JSON.stringify(short)}`),
      );
    });
  });
});
