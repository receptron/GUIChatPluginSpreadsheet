// The lookups' exact match compares text without regard to case, as Excel's does; accents still
// count, and a number still matches its text (#167).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { valuesOf } from "./formulaColumns.ts";

const COLUMNS = [
  ["b", "c", "e", "10"],
  [1, 2, 3, 4],
  ["x", 9],
  ["y", 8],
];

describe("an exact match without regard to case", () => {
  it("is found by MATCH, XLOOKUP, VLOOKUP and HLOOKUP", () => {
    assert.deepEqual(
      valuesOf(
        [
          '=MATCH("C",A1:A4,0)',
          '=XLOOKUP("C",A1:A4,B1:B4)',
          '=VLOOKUP("C",A1:B4,2,FALSE)',
          '=HLOOKUP("X",C1:D2,2,FALSE)',
          '=XLOOKUP("C",A1:A4,B1:B4,"none",1)',
        ],
        COLUMNS,
      ),
      [2, 2, 2, 9, 2],
    );
  });

  it("still tells accents apart, and still matches a number to its text", () => {
    assert.deepEqual(valuesOf(['=MATCH("é",A1:A4,0)', "=MATCH(10,A1:A4,0)", '=XLOOKUP("E",A1:A4,B1:B4,"none",0,-1)'], COLUMNS), ["#N/A", 4, 3]);
  });
});
