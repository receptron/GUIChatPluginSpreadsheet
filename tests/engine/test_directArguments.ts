// A value written directly as an aggregate's argument is read as Excel reads it there: a logical
// value as 1 or 0, text that is a number as that number, and other text as #VALUE!. Text and
// logical values reached through a reference are still skipped. The generated check mixes written
// values with a range and works out Excel's answer itself; rerun one seed with DIRECT_ARGS_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pick, seededRandom } from "./seededRandom.ts";
import { valuesBesideCells } from "./formulaColumns.ts";

// A1 holds "x", A2 TRUE, A3 5; the formulas go down column B.
const valuesOf = (formulas: string[]): unknown[] => valuesBesideCells(formulas, [{ v: "x" }, { v: true }, { v: 5 }]);

describe("a value written as an aggregate's argument", () => {
  it("answers the issue's formulas as Excel does", () => {
    assert.deepEqual(valuesOf(['=SUM("x",1)', '=AVERAGE("x",1,3)', '=STDEV("x",1,2)', "=SUM(TRUE,1)", "=AVERAGE(TRUE,3)", "=SUM(1=1,1)", '=SUM("2",1)']), [
      "#VALUE!",
      "#VALUE!",
      "#VALUE!",
      2,
      2,
      2,
      3,
    ]);
  });

  it("is #VALUE! as text in every aggregate, an empty text included", () => {
    ["SUM", "AVERAGE", "MAX", "MIN", "MEDIAN", "STDEV", "VAR", "STDEVP", "VARP", "GEOMEAN", "SKEW"].forEach((name) =>
      assert.deepEqual(valuesOf([`=${name}("x",1,2,4)`, `=${name}("",1,2,4)`]), ["#VALUE!", "#VALUE!"], name),
    );
  });

  it("is counted by COUNT when it is a number or a logical value, and skipped when it is other text", () => {
    assert.deepEqual(valuesOf(["=COUNT(TRUE,1)", '=COUNT("x",1)', '=COUNT("2")', "=COUNT(1=1)"]), [2, 1, 1, 1]);
  });

  it("is skipped as text or a logical value when reached through a reference", () => {
    assert.deepEqual(valuesOf(["=SUM(A1:A3)", "=SUM(A1,A2)", "=AVERAGE(A1:A3,1)", "=COUNT(A1:A3)"]), [5, 0, 3, 1]);
  });

  it("answers the first error in argument order", () => {
    assert.deepEqual(valuesOf(['=SUM(SQRT(-1),"x")', '=SUM("x",SQRT(-1))', "=SUM(SQRT(-1),TRUE)"]), ["#NUM!", "#VALUE!", "#NUM!"]);
  });
});

const baseSeed = Number(process.env.DIRECT_ARGS_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 300;
// Each written argument, and what Excel reads it as in an aggregate.
const WRITTEN: [string, number | string][] = [
  ["2", 2],
  ["-1.5", -1.5],
  ['"3"', 3],
  ["TRUE", 1],
  ["FALSE", 0],
  ["1=1", 1],
  ['"x"', "#VALUE!"],
  ['""', "#VALUE!"],
  ["SQRT(-1)", "#NUM!"],
];

type Aggregate = (numbers: number[]) => number | string;
const mean = (numbers: number[]): number => numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
const AGGREGATES: [string, Aggregate][] = [
  ["SUM", (numbers) => numbers.reduce((sum, value) => sum + value, 0)],
  ["AVERAGE", (numbers) => (numbers.length > 0 ? mean(numbers) : "#DIV/0!")],
  ["MAX", (numbers) => (numbers.length > 0 ? Math.max(...numbers) : 0)],
  ["MIN", (numbers) => (numbers.length > 0 ? Math.min(...numbers) : 0)],
];
const close = (actual: unknown, expected: number | string): boolean =>
  typeof expected === "number" ? typeof actual === "number" && Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)) : actual === expected;

describe(`written arguments beside a range (seed ${baseSeed})`, () => {
  it("answers as Excel reads each argument", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const written = Array.from({ length: 1 + Math.floor(random() * 3) }, () => pick(random, WRITTEN));
      const [name, aggregate] = pick(random, AGGREGATES);
      // The range A1:A3 contributes 5 alone: its "x" and TRUE are skipped.
      const args = [...written.map(([text]) => text), "A1:A3"];
      const firstError = written.map(([, value]) => value).find((value): value is string => typeof value === "string");
      const expected = firstError ?? aggregate([...written.map(([, value]) => Number(value)), 5]);
      const [actual] = valuesOf([`=${name}(${args.join(",")})`]);
      assert.ok(close(actual, expected), `seed ${baseSeed}: =${name}(${args.join(",")}) → ${String(actual)}, expected ${String(expected)}`);
    });
  });
});
