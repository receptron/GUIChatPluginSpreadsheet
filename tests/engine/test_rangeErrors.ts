// An aggregate answers the first error among its arguments — an error cell in a range, or an
// argument that evaluated to one — as Excel does; the numeric reads used to skip it. COUNT still
// skips an error and COUNTA counts one. The generated check scatters errors through a range and
// expects the first in reading order; rerun one seed with RANGE_ERRORS_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import type { SpreadsheetCell } from "../../src/engine/types.ts";
import { cellAt } from "./cellAccess.ts";
import { pick, seededRandom } from "./seededRandom.ts";

/** Each formula's value, with `data` in rows 1 and 2 and the formulas below them. */
function valuesOf(data: SpreadsheetCell[][], formulas: string[]): unknown[] {
  const grid = new SpreadsheetEngine().calculate({ name: "S", data: [...data, ...formulas.map((formula) => [{ v: formula }])] } satisfies SheetData).data;
  return formulas.map((_, index) => cellAt(grid, data.length + index, 0));
}

// A1 = #DIV/0!, B1 = 2, C1 = #NUM!; row 2 holds plain numbers to pair with.
const DATA: SpreadsheetCell[][] = [
  [{ v: "=1/0" }, { v: 2 }, { v: "=SQRT(-1)" }],
  [{ v: 1 }, { v: 2 }, { v: 3 }],
];

const AGGREGATES = ["SUM", "AVERAGE", "MAX", "MIN", "MEDIAN", "MODE", "STDEV", "VAR", "STDEVP", "VARP", "STDEV.S", "VAR.P"];

describe("an error in an aggregate's arguments", () => {
  it("is the answer of the issue's formulas", () => {
    assert.deepEqual(valuesOf(DATA, ["=SUM(A1:B1)", "=COUNT(A1:B1)", "=AVERAGE(A1:B1)", "=MAX(A1:B1)", "=SUM(A1,B1)"]), [
      "#DIV/0!",
      1,
      "#DIV/0!",
      "#DIV/0!",
      "#DIV/0!",
    ]);
  });

  it("is the answer of every aggregate over the values", () => {
    AGGREGATES.forEach((name) => assert.deepEqual(valuesOf(DATA, [`=${name}(A1:C1)`, `=${name}(B1:C1)`]), ["#DIV/0!", "#NUM!"], name));
  });

  it("is the answer of the ranked and paired functions", () => {
    assert.deepEqual(
      valuesOf(DATA, [
        "=LARGE(A1:C1,1)",
        "=SMALL(B1:C1,1)",
        "=PERCENTILE(A1:C1,0.5)",
        "=QUARTILE(B1:C1,1)",
        "=CORREL(A1:C1,A2:C2)",
        "=SLOPE(A2:C2,B1:C1)",
        "=INTERCEPT(A2:C2,A1:C1)",
        "=RSQ(A2:C2,B1:C1)",
      ]),
      ["#DIV/0!", "#NUM!", "#DIV/0!", "#NUM!", "#DIV/0!", "#NUM!", "#DIV/0!", "#NUM!"],
    );
  });

  it("is the first in argument order, then in reading order", () => {
    assert.deepEqual(valuesOf(DATA, ["=SUM(C1,A1)", "=SUM(B1,C1:C1,A1:A1)", "=SUM(A1:C1)", "=MAX(B1:C1,A1)"]), ["#NUM!", "#NUM!", "#DIV/0!", "#NUM!"]);
  });

  it("is not counted by COUNT, and is counted by COUNTA", () => {
    assert.deepEqual(valuesOf(DATA, ["=COUNT(A1:C1)", "=COUNTA(A1:C1)", "=COUNT(A1:C2)"]), [1, 3, 4]);
  });

  it("leaves an aggregate over values without an error as it was", () => {
    assert.deepEqual(valuesOf(DATA, ["=SUM(A2:C2)", "=AVERAGE(A2:C2,B1)", "=MAX(B1:B2)", "=CORREL(A2:C2,A2:C2)"]), [6, 2, 2, 1]);
  });
});

const baseSeed = Number(process.env.RANGE_ERRORS_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 200;
const WIDTH = 5;
const CELLS: SpreadsheetCell[] = [{ v: 1 }, { v: 4 }, { v: -2 }, { v: "a" }, { v: "" }, {}, { v: "=1/0" }, { v: "=SQRT(-1)" }, { v: "=1+1" }];
const ERROR_OF: Record<string, string> = { "=1/0": "#DIV/0!", "=SQRT(-1)": "#NUM!" };

describe(`errors scattered through a range (seed ${baseSeed})`, () => {
  it("answers the first error in reading order, or a number when there is none", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const row = Array.from({ length: WIDTH }, () => pick(random, CELLS));
      const name = pick(random, ["SUM", "AVERAGE", "MAX", "MIN", "MEDIAN", "STDEVP", "VARP"]);
      const [answer] = valuesOf([row], [`=${name}(A1:E1)`]);
      const firstError = row.map((cell) => ERROR_OF[String("v" in cell ? cell.v : "")]).find((error) => error !== undefined);
      const label = `seed ${baseSeed}: ${name} over ${JSON.stringify(row)}`;
      if (firstError) assert.equal(answer, firstError, label);
      else assert.ok(typeof answer === "number" || answer === "#DIV/0!", `${label} → ${String(answer)}`);
    });
  });
});
