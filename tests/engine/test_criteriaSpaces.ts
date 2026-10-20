// A criteria compares as the value its argument evaluates to, spaces and quotes included (#165).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { valuesOf } from "./formulaColumns.ts";

describe("criteria with spaces and quotes", () => {
  it("does not match a value without the spaces or quotes it has", () => {
    const values = ["x", " x", "", '"q"', 5];
    const criteria = ['"q"', "q"];
    assert.deepEqual(
      valuesOf(
        [
          '=COUNTIF(A1:A5," x")',
          '=COUNTIF(A1:A5,"x")',
          '=COUNTIF(A1:A5,"=")',
          "=COUNTIF(A1:A5,B1)",
          "=COUNTIF(A1:A5,B2)",
          '=COUNTIF(A1:A5,">= 5")',
          '=SUMIF(A1:A5," x",A1:A5)',
        ],
        [values, criteria],
      ),
      [1, 1, 1, 1, 0, 1, 0],
    );
  });
});
