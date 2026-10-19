// FORECAST.LINEAR, TREND, STEYX, COVARIANCE.S/.P, PEARSON, MAXIFS and MINIFS. Checked against
// Microsoft's worked examples, against exact references (tests/tools/generate_regression_reference.py,
// rational arithmetic, so the inputs' decimals are the true values), and against properties that
// hold whatever the formulas are. Generated cases print their seed; rerun one with REGRESSION_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { forecastLinear, populationCovariance, sampleCovariance, standardErrorOfEstimate, trendAt } from "../../src/engine/functions/regression-math.ts";
import { valuesOf } from "./formulaColumns.ts";
import { seededRandom } from "./seededRandom.ts";

const RELATIVE_TOLERANCE = 1e-9;

const assertClose = (actual: unknown, expected: number, label: string): void => {
  assert.equal(typeof actual, "number", `${label}: ${String(actual)}`);
  const error = Math.abs(Number(actual) - expected) / Math.max(Math.abs(expected), 1);
  assert.ok(error <= RELATIVE_TOLERANCE, `${label}: ${String(actual)} vs ${expected} (error ${error.toExponential(2)})`);
};

const roundedTo = (digits: number, value: unknown): number => Number(Number(value).toFixed(digits));

describe("Microsoft's worked examples", () => {
  const knownY = [6, 7, 9, 15, 21];
  const knownX = [20, 28, 31, 38, 40];

  it("FORECAST.LINEAR, its alias FORECAST, and TREND at the same x", () => {
    const values = valuesOf(["=FORECAST.LINEAR(30,A1:A5,B1:B5)", "=FORECAST(30,A1:A5,B1:B5)", "=TREND(A1:A5,B1:B5,30)"], [knownY, knownX]);
    values.forEach((value) => assert.equal(roundedTo(6, value), 10.607253));
  });

  it("STEYX, and PEARSON as CORREL", () => {
    const [steyx, pearson, correl] = valuesOf(
      ["=STEYX(A1:A7,B1:B7)", "=PEARSON(A1:A7,B1:B7)", "=CORREL(A1:A7,B1:B7)"],
      [
        [2, 3, 9, 1, 8, 7, 5],
        [6, 5, 11, 7, 5, 4, 4],
      ],
    );
    assert.equal(roundedTo(6, steyx), 3.305719);
    assert.equal(pearson, correl);
  });

  it("COVARIANCE.P and COVARIANCE.S", () => {
    const [population] = valuesOf(
      ["=COVARIANCE.P(A1:A5,B1:B5)"],
      [
        [3, 2, 4, 5, 6],
        [9, 7, 12, 15, 17],
      ],
    );
    const [sample] = valuesOf(
      ["=COVARIANCE.S(A1:A3,B1:B3)"],
      [
        [2, 4, 8],
        [5, 11, 12],
      ],
    );
    assert.equal(roundedTo(9, population), 5.2);
    assert.equal(roundedTo(9, sample), 9.666666667);
  });

  it("MAXIFS and MINIFS", () => {
    const grades = [89, 93, 96, 85, 91, 88];
    const weights = [1, 2, 2, 3, 1, 1];
    assert.deepEqual(valuesOf(["=MAXIFS(A1:A6,B1:B6,1)", "=MINIFS(A1:A6,B1:B6,1)"], [grades, weights]), [91, 88]);
  });
});

interface ReferenceCase {
  ys: number[];
  xs: number[];
  newX: number;
  covarianceP: string;
  covarianceS: string;
  trendThroughOrigin: string;
  forecast?: string;
  steyx?: string;
}

const isReferenceCase = (value: unknown): value is ReferenceCase =>
  typeof value === "object" &&
  value !== null &&
  ["ys", "xs"].every((key) => Array.isArray(Reflect.get(value, key))) &&
  typeof Reflect.get(value, "newX") === "number";

const parsed: unknown = JSON.parse(readFileSync(new URL("./fixtures/regression-reference.json", import.meta.url), "utf8"));
const referenceCases: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "cases") : undefined;
assert.ok(Array.isArray(referenceCases) && referenceCases.length > 0 && referenceCases.every(isReferenceCase), "the reference fixture holds cases");
const cases: ReferenceCase[] = referenceCases.filter(isReferenceCase);

describe("the regression rules against exact references", () => {
  it("matches FORECAST.LINEAR and TREND with a constant", () => {
    cases.forEach(({ ys, xs, newX, forecast }, index) => {
      if (forecast === undefined) return;
      assertClose(forecastLinear({ ys, xs }, newX), Number(forecast), `case ${index} forecast`);
      assertClose(trendAt(ys, xs, newX, true), Number(forecast), `case ${index} trend`);
    });
  });

  it("matches TREND through the origin", () => {
    cases.forEach(({ ys, xs, newX, trendThroughOrigin }, index) => assertClose(trendAt(ys, xs, newX, false), Number(trendThroughOrigin), `case ${index}`));
  });

  it("matches STEYX", () => {
    cases.forEach(({ ys, xs, steyx }, index) => {
      if (steyx !== undefined) assertClose(standardErrorOfEstimate({ ys, xs }), Number(steyx), `case ${index}`);
    });
  });

  it("matches COVARIANCE.P and COVARIANCE.S", () => {
    cases.forEach(({ ys, xs, covarianceP, covarianceS }, index) => {
      assertClose(populationCovariance({ ys, xs }), Number(covarianceP), `case ${index} P`);
      assertClose(sampleCovariance({ ys, xs }), Number(covarianceS), `case ${index} S`);
    });
  });
});

describe("argument rules", () => {
  const ys = [1, 2, 4];
  const xs = [1, 2, 3];

  it("answers #N/A for ranges of different sizes or with no pair of numbers", () => {
    assert.deepEqual(
      valuesOf(
        ["=FORECAST.LINEAR(1,A1:A3,B1:B2)", "=STEYX(A1:A3,B1:B2)", "=COVARIANCE.P(A1:A3,B1:B2)", "=FORECAST.LINEAR(1,C1:C3,B1:B3)", "=STEYX(C1:C3,B1:B3)"],
        [ys, xs, ["a", "b", "c"]],
      ),
      ["#N/A", "#N/A", "#N/A", "#N/A", "#N/A"],
    );
  });

  it("answers #DIV/0! for an x that never varies, too few points, or nothing to average", () => {
    assert.deepEqual(
      valuesOf(
        ["=FORECAST.LINEAR(1,A1:A3,C1:C3)", "=STEYX(A1:A3,C1:C3)", "=STEYX(A1:A2,B1:B2)", "=COVARIANCE.S(A1:A1,B1:B1)", "=COVARIANCE.P(D1:D3,B1:B3)"],
        [ys, xs, [5, 5, 5], ["a", "b", "c"]],
      ),
      ["#DIV/0!", "#DIV/0!", "#DIV/0!", "#DIV/0!", "#DIV/0!"],
    );
  });

  it("answers #VALUE! for an x that is text, and passes an error argument through", () => {
    assert.deepEqual(valuesOf(['=FORECAST.LINEAR("a",A1:A3,B1:B3)', "=FORECAST.LINEAR(1/0,A1:A3,B1:B3)"], [ys, xs]), ["#VALUE!", "#DIV/0!"]);
  });

  it("drops a row with a blank or text side, as CORREL does", () => {
    const values = valuesOf(
      [
        "=FORECAST.LINEAR(5,A1:A5,B1:B5)",
        "=FORECAST.LINEAR(5,A6:A8,B6:B8)",
        "=STEYX(A1:A5,B1:B5)",
        "=STEYX(A6:A8,B6:B8)",
        "=COVARIANCE.S(A1:A5,B1:B5)",
        "=COVARIANCE.S(A6:A8,B6:B8)",
      ],
      [
        [1, "", 2, 4, "x", 1, 2, 4],
        [1, 9, 2, 3, 7, 1, 2, 3],
      ],
    );
    [0, 2, 4].forEach((gapped) => {
      assert.equal(typeof values[gapped + 1], "number");
      assert.equal(values[gapped], values[gapped + 1]);
    });
  });
});

describe("TREND", () => {
  const ys = [3, 5, 9, 11];
  const xs = [1, 2, 4, 5];

  it("fits known_x 1, 2, 3, … when it is left out", () => {
    const [omitted, written] = valuesOf(["=TREND(A1:A4,,6)", "=TREND(A1:A4,C1:C4,6)"], [ys, xs, [1, 2, 3, 4]]);
    assert.equal(omitted, written);
  });

  it("fits through the origin with const FALSE, and with a constant otherwise", () => {
    const [origin, constant, defaulted] = valuesOf(["=TREND(A1:A4,B1:B4,10,FALSE)", "=TREND(A1:A4,B1:B4,10,TRUE)", "=TREND(A1:A4,B1:B4,10)"], [ys, xs]);
    assertClose(origin, (10 * (3 + 10 + 36 + 55)) / (1 + 4 + 16 + 25), "Σxy / Σx² · x");
    assert.equal(constant, defaulted);
    assertClose(constant, 21, "y = 2x + 1");
  });

  it("drops an x collinear with the constant, as LINEST does, leaving the mean of y", () => {
    assert.deepEqual(valuesOf(["=TREND(A1:A4,B1:B4,9)"], [ys, [2, 2, 2, 2]]), [7]);
  });

  it("keeps a constant x through the origin, where only an all-zero x is dropped", () => {
    assert.deepEqual(valuesOf(["=TREND(A1:A4,B1:B4,9,FALSE)", "=TREND(A1:A4,C1:C4,9,FALSE)"], [ys, [2, 2, 2, 2], [0, 0, 0, 0]]), [31.5, 0]);
  });

  it("reads the ranges whole: #REF! for different sizes, #VALUE! for a blank or text, an error passed through", () => {
    assert.deepEqual(
      valuesOf(
        ["=TREND(A1:A4,B1:B3,6)", "=TREND(A1:A4,C1:C4,6)", "=TREND(A1:A4,D1:D4,6)", "=TREND(A1:A4,E1:E4,6)"],
        [ys, xs, [1, "", 3, 4], [1, "x", 3, 4], [1, "=1/0", 3, 4]],
      ),
      ["#REF!", "#VALUE!", "#VALUE!", "#DIV/0!"],
    );
  });

  it("takes one new x: a cell holding a number, not several cells or text", () => {
    assert.deepEqual(
      valuesOf(
        ["=TREND(A1:A4,B1:B4,C1)", "=TREND(A1:A4,B1:B4,C1:C1)", "=TREND(A1:A4,B1:B4,C1:C2)", '=TREND(A1:A4,B1:B4,"x")', "=TREND(A1:A4,B1:B4,C2)"],
        [ys, xs, [10, "y"]],
      ),
      [21, 21, "#VALUE!", "#VALUE!", "#VALUE!"],
    );
  });

  it("passes an error in new x or const through, written or read from a cell", () => {
    assert.deepEqual(valuesOf(["=TREND(A1:A4,B1:B4,1/0)", "=TREND(A1:A4,B1:B4,C1)", "=TREND(A1:A4,B1:B4,6,C1)"], [ys, xs, ["=1/0"]]), [
      "#DIV/0!",
      "#DIV/0!",
      "#DIV/0!",
    ]);
  });
});

describe("MAXIFS and MINIFS", () => {
  const regions = ["East", "West", "East", "East", "West"];
  const sales = [10, 40, "n/a", 3, 25];

  it("answer 0 when no row meets the conditions, and skip values that hold no number", () => {
    assert.deepEqual(
      valuesOf(
        ['=MAXIFS(B1:B5,A1:A5,"East")', '=MINIFS(B1:B5,A1:A5,"East")', '=MAXIFS(B1:B5,A1:A5,"North")', '=MINIFS(B1:B5,A1:A5,"North")'],
        [regions, sales],
      ),
      [10, 3, 0, 0],
    );
  });

  it("meet every condition, and answer #VALUE! for ranges of different sizes", () => {
    assert.deepEqual(
      valuesOf(['=MAXIFS(B1:B5,A1:A5,"East",B1:B5,"<5")', '=MINIFS(B1:B5,A1:A5,"West",B1:B5,">30")', '=MAXIFS(B1:B5,A1:A4,"East")'], [regions, sales]),
      [3, 40, "#VALUE!"],
    );
  });

  it("pass an error in a criteria through", () => {
    assert.deepEqual(valuesOf(["=MAXIFS(B1:B5,A1:A5,1/0)"], [regions, sales]), ["#DIV/0!"]);
  });
});

const baseSeed = Number(process.env.REGRESSION_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 200;

function generatedPairs(random: () => number): { ys: number[]; xs: number[] } {
  const count = 3 + Math.floor(random() * 25);
  const xs = Array.from({ length: count }, () => Math.round((random() * 200 - 100) * 100) / 100);
  return { xs, ys: xs.map((x) => Math.round((x * (random() * 6 - 3) + random() * 50) * 100) / 100) };
}

describe(`properties over generated samples (seed ${baseSeed})`, () => {
  it("puts the line through the means, and agrees with TREND", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach((_, index) => {
      const pairs = generatedPairs(random);
      const label = `seed ${baseSeed} case ${index}`;
      const xMean = pairs.xs.reduce((sum, x) => sum + x, 0) / pairs.xs.length;
      const yMean = pairs.ys.reduce((sum, y) => sum + y, 0) / pairs.ys.length;
      const atMean = forecastLinear(pairs, xMean);
      if (typeof atMean !== "number") return;
      assertClose(atMean, yMean, `${label} at x̄`);
      const newX = random() * 300 - 150;
      assertClose(trendAt(pairs.ys, pairs.xs, newX, true), Number(forecastLinear(pairs, newX)), `${label} trend`);
    });
  });

  it("relates the two covariances by n / (n − 1), and gives VAR.P for a range with itself", () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: GENERATED_CASES }).forEach((_, index) => {
      const { xs, ys } = generatedPairs(random);
      const label = `seed ${baseSeed} case ${index}`;
      assertClose(Number(sampleCovariance({ ys, xs })) * (xs.length - 1), Number(populationCovariance({ ys, xs })) * xs.length, label);
      const [covariance, variance] = valuesOf(["=COVARIANCE.P(A1:A30,A1:A30)", "=VAR.P(A1:A30)"], [xs]);
      assertClose(covariance, Number(variance), `${label} with itself`);
    });
  });

  it("gives STEYX 0 for points on a line, and scales it with y", () => {
    const random = seededRandom(baseSeed + 2);
    Array.from({ length: GENERATED_CASES }).forEach((_, index) => {
      const { xs, ys } = generatedPairs(random);
      const label = `seed ${baseSeed} case ${index}`;
      const onLine = xs.map((x) => 3 * x - 7);
      const exact = standardErrorOfEstimate({ ys: onLine, xs });
      const yScale = Math.max(...onLine.map(Math.abs));
      if (typeof exact === "number") assert.ok(exact <= RELATIVE_TOLERANCE * yScale, `${label}: ${exact}`);
      const steyx = standardErrorOfEstimate({ ys, xs });
      if (typeof steyx === "number") assertClose(standardErrorOfEstimate({ ys: ys.map((y) => y * 4), xs }), steyx * 4, `${label} scaled`);
    });
  });
});
