// An aggregate answers the first error among its arguments — an error cell in a range, or an
// argument that evaluated to one — as Excel does; the numeric reads used to skip it. COUNT still
// skips an error and COUNTA counts one. The generated check scatters errors through a range and
// expects the first in reading order; rerun one seed with RANGE_ERRORS_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { functionRegistry, type FunctionContext } from "../../src/engine/registry.ts";
import { DIV_ZERO_ERROR, NUM_ERROR, VALUE_ERROR, isSpreadsheetErrorValue } from "../../src/engine/spreadsheet-errors.ts";
import type { CellValue } from "../../src/engine/types.ts";
import type { SpreadsheetCell } from "../../src/engine/types.ts";
import { cellAt } from "./cellAccess.ts";
import { pick, seededRandom } from "./seededRandom.ts";

const isCellValueForTest = (value: unknown): value is CellValue => typeof value === "number" || isSpreadsheetErrorValue(value);

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

  it("is the answer of RANK, before its order is read", () => {
    assert.deepEqual(valuesOf(DATA, ["=RANK(2,A1:C1)", "=RANK(2,B1:C1)", "=RANK(2,A1:C1,1/0)", "=RANK(2,A2:C2)"]), ["#DIV/0!", "#NUM!", "#DIV/0!", 2]);
  });

  it("is the answer of a regression or covariance over the ranges", () => {
    assert.deepEqual(valuesOf(DATA, ["=FORECAST.LINEAR(1,A1:C1,A2:C2)", "=STEYX(A2:C2,B1:C1)", "=COVARIANCE.P(A1:C1,A2:C2)", "=COVARIANCE.S(A2:C2,A2:C2)"]), [
      "#DIV/0!",
      "#NUM!",
      "#DIV/0!",
      1,
    ]);
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

/** A context whose evaluator answers 1, 2, 3, … on successive calls, as a volatile function would,
 *  and whose range readers each answer [10, 20]; it counts both. */
function countingContext(name: string): { context: FunctionContext; calls: { evaluations: number; rangeReads: number } } {
  const calls = { evaluations: 0, rangeReads: 0 };
  const evaluateFormula = (): number => {
    calls.evaluations += 1;
    return calls.evaluations;
  };
  const range = (): number[] => {
    calls.rangeReads += 1;
    return [10, 20];
  };
  const context: FunctionContext = {
    functionName: name,
    getCellValue: () => 0,
    getRangeValues: range,
    getRangeValuesRaw: range,
    getRangeValuesKeepingBlanks: range,
    evaluateFormula,
  };
  return { context, calls };
}

describe("reading an aggregate's arguments", () => {
  it("evaluates each argument and reads each range once, repeated text included", () => {
    const cases: [string, string[], unknown, { evaluations: number; rangeReads: number }][] = [
      ["SUM", ["X()", "X()"], 3, { evaluations: 2, rangeReads: 0 }],
      ["SUM", ["X()", "A1:A2", "X()"], 33, { evaluations: 2, rangeReads: 1 }],
      ["AVERAGE", ["X()", "X()", "X()"], 2, { evaluations: 3, rangeReads: 0 }],
      ["MAX", ["A1:A2", "B1:B2"], 20, { evaluations: 0, rangeReads: 2 }],
      ["STDEVP", ["A1:A2"], 5, { evaluations: 0, rangeReads: 1 }],
      ["LARGE", ["A1:A2", "X()"], 20, { evaluations: 1, rangeReads: 1 }],
      ["CORREL", ["A1:A2", "B1:B2"], 1, { evaluations: 0, rangeReads: 2 }],
    ];
    cases.forEach(([name, args, expected, expectedCalls]) => {
      const definition = functionRegistry.get(name);
      assert.ok(definition, name);
      const { context, calls } = countingContext(name);
      assert.equal(definition.handler(args, context), expected, `${name}(${args.join(",")})`);
      assert.deepEqual(calls, expectedCalls, `${name}(${args.join(",")})`);
    });
  });
});

const host = (raw: unknown[]): FunctionContext => ({
  functionName: "SUM",
  getCellValue: () => 0,
  getRangeValues: () => [3, 5],
  getRangeValuesRaw: () => raw.filter(isCellValueForTest),
  evaluateFormula: (formula) => {
    if (formula === "1/0") return DIV_ZERO_ERROR;
    return formula.startsWith('"') ? formula.slice(1, -1) : Number(formula);
  },
});

describe("a host without the blank-aware read", () => {
  // The numeric read keeps 3 and 5; the raw read shows the blank as 0 and the error.

  it("still answers a range error, read from the raw read", () => {
    const sum = functionRegistry.get("SUM");
    assert.ok(sum);
    assert.equal(sum.handler(["A1:A3"], host([3, DIV_ZERO_ERROR, 5])), DIV_ZERO_ERROR);
    assert.equal(sum.handler(["2", "A1:A3"], host([3, 0, 5])), 10);
  });

  it("does not count a blank, which only the numeric read leaves out", () => {
    const average = functionRegistry.get("AVERAGE");
    assert.ok(average);
    assert.equal(average.handler(["A1:A3"], host([3, 0, 5])), 4);
  });

  it("reads a written argument as Excel does: text #VALUE!, numeric text its number", () => {
    const sum = functionRegistry.get("SUM");
    assert.ok(sum);
    assert.equal(sum.handler(['"x"', "A1:A3"], host([3, 0, 5])), VALUE_ERROR);
    assert.equal(sum.handler(['"2"', "A1:A3"], host([3, 0, 5])), 10);
  });

  it("answers the first error in argument order", () => {
    const sum = functionRegistry.get("SUM");
    assert.ok(sum);
    assert.equal(sum.handler(["1/0", "A1:A3"], host([NUM_ERROR])), DIV_ZERO_ERROR);
    assert.equal(sum.handler(["A1:A3", "1/0"], host([NUM_ERROR])), NUM_ERROR);
  });
});

describe("an error in a conditional aggregate's ranges", () => {
  // A: regions; B: values, B2 an error; C: values, C3 an error.
  const data: SpreadsheetCell[][] = [
    [{ v: "East" }, { v: 10 }, { v: 1 }],
    [{ v: "West" }, { v: "=1/0" }, { v: 2 }],
    [{ v: "East" }, { v: 30 }, { v: "=SQRT(-1)" }],
    [{ v: "=1/0" }, { v: 40 }, { v: 4 }],
  ];

  it("is the answer when its row is matched", () => {
    assert.deepEqual(
      valuesOf(data, [
        '=SUMIF(A1:A4,"West",B1:B4)',
        '=AVERAGEIF(A1:A4,"East",C1:C4)',
        '=SUMIFS(B1:B4,A1:A4,"West")',
        '=AVERAGEIFS(C1:C4,A1:A4,"East")',
        '=MAXIFS(B1:B4,A1:A4,"West")',
        '=MINIFS(C1:C4,A1:A4,"East")',
      ]),
      ["#DIV/0!", "#NUM!", "#DIV/0!", "#NUM!", "#DIV/0!", "#NUM!"],
    );
  });

  it("is the first matched one, in row order", () => {
    const twoErrors: SpreadsheetCell[][] = [
      [{ v: "x" }, { v: "=SQRT(-1)" }],
      [{ v: "x" }, { v: "=1/0" }],
    ];
    assert.deepEqual(valuesOf(twoErrors, ['=SUMIF(A1:A2,"x",B1:B2)', '=AVERAGEIF(A1:A2,"x",B1:B2)', '=SUMIFS(B1:B2,A1:A2,"x")']), ["#NUM!", "#NUM!", "#NUM!"]);
  });

  it("is not read when its row is not matched, nor when it sits in the criteria range", () => {
    assert.deepEqual(
      valuesOf(data, [
        '=SUMIF(A1:A4,"East",B1:B4)',
        '=AVERAGEIF(A1:A4,"West",C1:C4)',
        '=SUMIFS(B1:B4,A1:A4,"East")',
        '=MAXIFS(C1:C4,A1:A4,"West")',
        '=COUNTIF(A1:A4,"East")',
        '=COUNTIFS(A1:A4,"East",B1:B4,">0")',
        '=SUMIF(B1:B4,">5")',
      ]),
      [40, 2, 40, 2, 2, 2, 80],
    );
  });
});

const baseSeed = Number(process.env.RANGE_ERRORS_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 200;
const WIDTH = 5;
const CELLS: SpreadsheetCell[] = [{ v: 1 }, { v: 4 }, { v: -2 }, { v: "a" }, { v: "" }, {}, { v: "=1/0" }, { v: "=SQRT(-1)" }, { v: "=1+1" }];
const ERROR_OF: Record<string, string> = { "=1/0": "#DIV/0!", "=SQRT(-1)": "#NUM!" };

describe(`errors scattered through a range (seed ${baseSeed})`, () => {
  it("answers the first error in reading order, or what the function answers without one", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const row = Array.from({ length: WIDTH }, () => pick(random, CELLS));
      const name = pick(random, ["SUM", "AVERAGE", "MAX", "MIN", "MEDIAN", "STDEVP", "VARP"]);
      const [answer] = valuesOf([row], [`=${name}(A1:E1)`]);
      const firstError = row.map((cell) => ERROR_OF[String("v" in cell ? cell.v : "")]).find((error) => error !== undefined);
      const label = `seed ${baseSeed}: ${name} over ${JSON.stringify(row)}`;
      if (firstError) assert.equal(answer, firstError, label);
      // With no number left, AVERAGE and the spreads answer #DIV/0! and MEDIAN #NUM!, as before.
      else assert.ok(typeof answer === "number" || answer === "#DIV/0!" || answer === "#NUM!", `${label} → ${String(answer)}`);
    });
  });
});
