// The pure parts of spilling: how an array result is normalized, which formulas may spill, and
// which cells a table fills.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cellsOf, isCellArray, normalizedValue, scalarOf } from "../../src/engine/cellArray.ts";
import { isSoleRangeReference, isSoleReference } from "../../src/engine/spillCandidate.ts";
import { spillTargets } from "../../src/engine/spillTargets.ts";
import { NA_ERROR, VALUE_ERROR } from "../../src/engine/spreadsheet-errors.ts";

describe("normalizedValue, scalarOf and cellsOf", () => {
  it("keeps a single value and a rectangular table as they are", () => {
    assert.equal(normalizedValue(3), 3);
    assert.deepEqual(
      normalizedValue([
        [1, 2],
        [3, 4],
      ]),
      [
        [1, 2],
        [3, 4],
      ],
    );
  });

  it("reads a 1×1 table as its cell, an empty one as #VALUE!, and fills a ragged one with #N/A", () => {
    assert.equal(normalizedValue([["x"]]), "x");
    assert.equal(normalizedValue([]), VALUE_ERROR);
    assert.equal(normalizedValue([[]]), VALUE_ERROR);
    assert.deepEqual(normalizedValue([[1, 2, 3], [4]]), [
      [1, 2, 3],
      [4, NA_ERROR, NA_ERROR],
    ]);
  });

  it("stands a table of more than one cell for #VALUE! where one value is needed", () => {
    assert.equal(scalarOf([[1, 2]]), VALUE_ERROR);
    assert.equal(scalarOf([[7]]), 7);
    assert.equal(scalarOf(true), true);
  });

  it("lists a table's cells in reading order", () => {
    assert.deepEqual(
      cellsOf([
        [1, 2],
        [3, 4],
      ]),
      [1, 2, 3, 4],
    );
    assert.deepEqual(cellsOf("a"), ["a"]);
    assert.equal(isCellArray([[1]]), true);
    assert.equal(isCellArray("[[1]]"), false);
  });
});

describe("which formulas may spill", () => {
  it("takes a bare range reference, on this sheet or a named one", () => {
    ["A1:B3", " $A$1:$B$3 ", "a1:b3", "A:A", "B:D", "1:3", "Data!A1:B2", "'My Sheet'!A1:B2", "'It''s'!A:A", "基準!A1:B2"].forEach((text) =>
      assert.equal(isSoleRangeReference(text), true, text),
    );
  });

  it("refuses anything more than a range reference", () => {
    ["A1", "A1:B3+1", "SUM(A1:B3)", "1+Data!A1:B2", "A1:B", "A:1", "", "(A1:B3)", "A1:B3,C1"].forEach((text) =>
      assert.equal(isSoleRangeReference(text), false, text),
    );
  });

  it("tells a reference, to a range or a cell, from anything else", () => {
    ["A1", "$B$2", "Data!C3", "'My Sheet'!A1", "A1:B2"].forEach((text) => assert.equal(isSoleReference(text), true, text));
    ["SORT(A1:A3)", "1+Data!A1", "A1+1", "TRUE", '"A1"'].forEach((text) => assert.equal(isSoleReference(text), false, text));
  });
});

describe("spillTargets", () => {
  it("lists every cell of the table but the anchor, placed from it", () => {
    assert.deepEqual(
      spillTargets({ row: 2, col: 1 }, [
        [1, 2],
        [3, 4],
      ]),
      [
        { row: 2, col: 2, value: 2 },
        { row: 3, col: 1, value: 3 },
        { row: 3, col: 2, value: 4 },
      ],
    );
    assert.deepEqual(spillTargets({ row: 0, col: 0 }, [[1]]), []);
  });
});
