// XLOOKUP with a return range of several rows and columns answers the whole matching row or column.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type CellValue } from "../../src/engine/index.ts";

const TABLE: CellValue[][] = [
  ["a", 1, 10, 100],
  ["b", 2, 20, 200],
  ["c", 3, 30, 300],
];

function answer(formula: string): CellValue[][] {
  const data = TABLE.map((row, r) => [...row, "", r === 0 ? formula : ""].map((v) => ({ v })));
  const [sheet] = new SpreadsheetEngine().calculateWorkbook([{ name: "S", data }]);
  return (sheet?.data ?? []).map((row) => row.slice(5)).filter((row) => row.some((cell) => cell !== ""));
}

describe("XLOOKUP over a table", () => {
  it("answers the matching row when the lookup runs down a column, and it spills and is read by other functions", () => {
    assert.deepEqual(answer('=XLOOKUP("b",A1:A3,B1:D3)'), [[2, 20, 200]]);
    assert.deepEqual(answer("=XLOOKUP(20,C1:C3,A1:D3)"), [["b", 2, 20, 200]]);
    assert.deepEqual(answer('=SUM(XLOOKUP("c",A1:A3,B1:D3))'), [[333]]);
  });

  it("answers the matching column when the lookup runs along a row", () => {
    assert.deepEqual(answer("=XLOOKUP(10,B1:D1,B1:D3)"), [[10], [20], [30]]);
  });

  it("answers if_not_found or #N/A without a match, and #N/A past the return range's end", () => {
    assert.deepEqual(answer('=XLOOKUP("z",A1:A3,B1:D3)'), [["#N/A"]]);
    assert.deepEqual(answer('=XLOOKUP("z",A1:A3,B1:D3,"none")'), [["none"]]);
    assert.deepEqual(answer('=XLOOKUP("c",A1:A3,B1:D2)'), [["#N/A"]]);
    assert.deepEqual(answer("=XLOOKUP(100,B1:D1,B1:C3)"), [["#N/A"]]);
  });

  it("still answers one cell for a return range of one column or one row", () => {
    assert.deepEqual(answer('=XLOOKUP("b",A1:A3,B1:B3)'), [[2]]);
    assert.deepEqual(answer("=XLOOKUP(20,B2:D2,B3:D3)"), [[30]]);
    // A one-row return range beside a column lookup is read position by position, as it always was.
    assert.deepEqual(answer('=XLOOKUP("b",A1:A3,B1:D1)'), [[10]]);
  });

  it("reads a one-cell lookup range as a column", () => {
    assert.deepEqual(answer('=XLOOKUP("a",A1:A1,B1:D3)'), [[1, 10, 100]]);
  });
});
