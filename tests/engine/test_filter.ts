// FILTER: which rows (or columns) it keeps, if_empty, the include argument's rules, and properties
// that hold for any data. Generated cases print their seed; rerun one with FILTER_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type CellValue } from "../../src/engine/index.ts";
import { filterTable } from "../../src/engine/functions/array-functions-math.ts";
import { NA_ERROR, VALUE_ERROR } from "../../src/engine/spreadsheet-errors.ts";
import { seededRandom } from "./seededRandom.ts";
import { spilledBeside } from "./formulaAnswers.ts";

/** What `formula`, written beside `rows` (a column apart), spills. */
function answer(formula: string, rows: CellValue[][]): CellValue[][] {
  return spilledBeside(formula, rows);
}

const sales: CellValue[][] = [
  ["East", 120],
  ["West", 80],
  ["East", 40],
  ["North", 300],
];

describe("FILTER", () => {
  it("keeps the rows whose include value is TRUE or a number other than 0", () => {
    assert.deepEqual(answer('=FILTER(A1:B4,A1:A4="East")', sales), [
      ["East", 120],
      ["East", 40],
    ]);
    assert.deepEqual(answer("=FILTER(A1:B4,{-1;0;0;0})", sales), [["East", 120]]);
    assert.deepEqual(answer("=FILTER(A1:B4,{1;0;0;2})", sales), [
      ["East", 120],
      ["North", 300],
    ]);
    assert.deepEqual(answer('=FILTER(A1:B4,(A1:A4="East")*(B1:B4>50))', sales), [["East", 120]]);
  });

  it("keeps columns when include is one row as wide as the table", () => {
    assert.deepEqual(answer("=FILTER(A1:B4,{FALSE,TRUE})", sales), [[120], [80], [40], [300]]);
    assert.deepEqual(answer("=FILTER(A1:B4,{FALSE,0})", sales), [["#CALC!"]]);
  });

  it("answers if_empty, or #CALC! without one, when nothing is kept, and reads if_empty only then", () => {
    assert.deepEqual(answer("=FILTER(A1:B4,B1:B4>1000)", sales), [["#CALC!"]]);
    assert.deepEqual(answer('=FILTER(A1:B4,B1:B4>1000,"none")', sales), [["none"]]);
    assert.deepEqual(answer("=FILTER(A1:B4,B1:B4>100,1/0)", sales), [
      ["East", 120],
      ["North", 300],
    ]);
  });

  it("is #VALUE! for include of another shape or holding text, and an include error's error", () => {
    assert.deepEqual(answer("=FILTER(A1:B4,B1:B3>100)", sales), [["#VALUE!"]]);
    assert.deepEqual(answer("=FILTER(A1:B4,B1:B4>{0,0})", sales), [["#VALUE!"]]);
    assert.deepEqual(answer("=FILTER(A1:B4,A1:A4)", sales), [["#VALUE!"]]);
    assert.deepEqual(answer("=FILTER(A1:B4,B1:B4/(B1:B4-80))", sales), [["#DIV/0!"]]);
  });

  it("answers a table if_empty as a table, and keeps an array's blank cells as 0 and error cells as their errors", () => {
    assert.deepEqual(answer('=FILTER(A1:B4,B1:B4>1000,{"-","-"})', sales), [["-", "-"]]);
    const withGaps: CellValue[][] = [
      ["East", ""],
      ["West", "=1/0"],
      ["East", 5],
    ];
    assert.deepEqual(answer('=FILTER(A1:B3,A1:A3<>"North")', withGaps), [
      ["East", 0],
      ["West", "#DIV/0!"],
      ["East", 5],
    ]);
  });

  it("filters a range on another sheet", () => {
    const data = [[{ v: "=FILTER(Data!A1:B3,Data!B1:B3>1)" }]];
    const other = [
      [{ v: "a" }, { v: 1 }],
      [{ v: "b" }, { v: 2 }],
      [{ v: "c" }, { v: 3 }],
    ];
    const [sheet] = new SpreadsheetEngine().calculateWorkbook([
      { name: "S", data },
      { name: "Data", data: other },
    ]);
    assert.deepEqual(sheet?.data, [
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("is read by other functions, and reads a call's table", () => {
    assert.deepEqual(answer('=SUM(FILTER(B1:B4,A1:A4="East"))', sales), [[160]]);
    assert.deepEqual(answer("=FILTER(SORT(A1:B4,2,-1),{1;1;0;0})", sales), [
      ["North", 300],
      ["East", 120],
    ]);
  });

  it("filterTable: null when nothing is kept, the first include error, #VALUE! for a shape that fits neither way", () => {
    assert.equal(filterTable([[1], [2]], [[false], [0]]), null);
    assert.equal(filterTable([[1], [2]], [[NA_ERROR], [VALUE_ERROR]]), NA_ERROR);
    assert.equal(filterTable([[1, 2]], [[true], [true]]), VALUE_ERROR);
    assert.deepEqual(filterTable([[5]], [[true]]), [[5]]);
  });
});

const baseSeed = Number(process.env.FILTER_SEED ?? Date.now() % 1_000_000);

describe(`properties over generated data (seed ${baseSeed})`, () => {
  it("the rows kept are the rows whose own condition is TRUE, in order, and their sum is SUMIF's", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: 20 }).forEach(() => {
      const height = 1 + Math.floor(random() * 8);
      const rows = Array.from({ length: height }, (_, index) => [Math.round(random() * 20), index]);
      const threshold = Math.round(random() * 20);
      const label = `seed ${baseSeed}: ${JSON.stringify(rows)} > ${threshold}`;
      const expected = rows.filter(([value = 0]) => value > threshold);
      const filtered = answer(`=FILTER(A1:B${height},A1:A${height}>${threshold})`, rows);
      assert.deepEqual(filtered, expected.length > 0 ? expected : [["#CALC!"]], label);
      const [sumOfFiltered] = answer(`=IFERROR(SUM(FILTER(A1:A${height},A1:A${height}>${threshold})),0)`, rows);
      const [sumIf] = answer(`=SUMIF(A1:A${height},">${threshold}")`, rows);
      assert.deepEqual(sumOfFiltered, sumIf, label);
    });
  });
});
