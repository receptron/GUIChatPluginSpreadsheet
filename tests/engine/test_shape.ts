// SKEW, KURT, STANDARDIZE, PERCENTRANK.INC, GEOMEAN and HARMEAN. Checked against Microsoft's
// worked examples and against properties that hold whatever the formulas are: skewness and
// kurtosis do not move when the data is shifted or scaled up, HM ≤ GM ≤ AM, and a percent rank
// runs from 0 at the smallest value to 1 at the largest. Generated cases print their seed; rerun
// one with SHAPE_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { geometricMean, harmonicMean, kurtosis, percentRank, skewness } from "../../src/engine/functions/shape-math.ts";
import { valuesOf as valuesOfColumns } from "./formulaColumns.ts";
import { seededRandom } from "./seededRandom.ts";

/** Each formula's value, with `column` down column A and the formulas down column B. */
const valuesOf = (formulas: string[], column: (number | string)[] = []): unknown[] => valuesOfColumns(formulas, [column]);

const roundedTo = (digits: number, value: unknown): number => Number(Number(value).toFixed(digits));

describe("Microsoft's worked examples", () => {
  it("SKEW and KURT", () => {
    const [skew, kurt] = valuesOf(["=SKEW(A1:A10)", "=KURT(A1:A10)"], [3, 4, 5, 2, 3, 4, 5, 6, 4, 7]);
    assert.equal(roundedTo(6, skew), 0.359543);
    assert.equal(roundedTo(9, kurt), -0.151799637);
  });

  it("GEOMEAN, HARMEAN and STANDARDIZE", () => {
    const [geo, harm, z] = valuesOf(["=GEOMEAN(A1:A7)", "=HARMEAN(A1:A7)", "=STANDARDIZE(42,40,1.5)"], [4, 5, 8, 7, 11, 4, 3]);
    assert.equal(roundedTo(6, geo), 5.476987);
    assert.equal(roundedTo(6, harm), 5.028376);
    assert.equal(roundedTo(5, z), 1.33333);
  });

  it("PERCENTRANK.INC, truncated to three digits, and its alias", () => {
    const data = [13, 12, 11, 8, 4, 3, 2, 1, 1, 1];
    assert.deepEqual(
      valuesOf(
        ["=PERCENTRANK.INC(A1:A10,2)", "=PERCENTRANK.INC(A1:A10,4)", "=PERCENTRANK.INC(A1:A10,8)", "=PERCENTRANK.INC(A1:A10,5)", "=PERCENTRANK(A1:A10,5)"],
        data,
      ),
      [0.333, 0.555, 0.666, 0.583, 0.583],
    );
    assert.deepEqual(valuesOf(["=PERCENTRANK.INC(A1:A10,5,5)", "=PERCENTRANK.INC(A1:A10,5,1.9)"], data), [0.58333, 0.5]);
  });
});

describe("argument rules", () => {
  it("answers #DIV/0! with too few values or none that differ", () => {
    assert.deepEqual(valuesOf(["=SKEW(A1:A2)", "=KURT(A1:A3)", "=SKEW(A4:A6)"], [1, 2, 3, 5, 5, 5]), ["#DIV/0!", "#DIV/0!", "#DIV/0!"]);
  });

  it("answers #NUM! for a value at or below zero in GEOMEAN and HARMEAN, and for no values", () => {
    assert.deepEqual(valuesOf(["=GEOMEAN(A1:A2)", "=HARMEAN(A1:A2)", "=GEOMEAN(A3:A3)", "=HARMEAN(-1,2)"], [1, 0]), ["#NUM!", "#NUM!", "#NUM!", "#NUM!"]);
  });

  it("answers #NUM! for a standard deviation that is not positive", () => {
    assert.deepEqual(valuesOf(["=STANDARDIZE(1,0,0)", "=STANDARDIZE(1,0,-1)"]), ["#NUM!", "#NUM!"]);
  });

  it("answers #N/A for an x outside the data, and #NUM! for no data or fewer than one digit", () => {
    assert.deepEqual(
      valuesOf(["=PERCENTRANK.INC(A1:A3,0)", "=PERCENTRANK.INC(A1:A3,4)", "=PERCENTRANK.INC(A1:A3,2,0)", "=PERCENTRANK.INC(A5:A6,1)"], [1, 2, 3]),
      ["#N/A", "#N/A", "#NUM!", "#NUM!"],
    );
  });

  it("ranks the only value as 1, and a repeated largest value by the values below it", () => {
    assert.deepEqual(valuesOf(["=PERCENTRANK.INC(A1:A1,7)"], [7]), [1]);
    assert.deepEqual(valuesOf(["=PERCENTRANK.INC(A1:A3,2)"], [1, 2, 2]), [0.5]);
  });

  it("skips cells that hold no number, as SUM does", () => {
    const [withGaps, compact] = valuesOf(["=SKEW(A1:A6)", "=SKEW(A7:A9)"], [1, "x", 2, "", 7, "", 1, 2, 7]);
    assert.equal(withGaps, compact);
  });

  it("answers the first error in a range or among the values, rather than skipping it", () => {
    const withError = [1, "=1/0", 3, "=SQRT(-1)"];
    assert.deepEqual(
      valuesOf(
        ["=GEOMEAN(A1:A3)", "=HARMEAN(A1:A3)", "=SKEW(A1:A4)", "=KURT(A1:A4)", "=PERCENTRANK.INC(A1:A3,2)", "=SKEW(A4,A2)", "=GEOMEAN(1,1/0,2)"],
        withError,
      ),
      ["#DIV/0!", "#DIV/0!", "#DIV/0!", "#DIV/0!", "#DIV/0!", "#NUM!", "#DIV/0!"],
    );
  });

  it("passes an error argument through", () => {
    assert.deepEqual(valuesOf(["=STANDARDIZE(1/0,0,1)", '=PERCENTRANK.INC(A1:A2,"x")'], [1, 2]), ["#DIV/0!", "#VALUE!"]);
  });

  it("keeps a rank that lands exactly on a digit", () => {
    const hundred = Array.from({ length: 101 }, (_, index) => index);
    assert.equal(percentRank(hundred, 29, 2), 0.29, "29 / 100 · 100 computes as 28.999…");
  });
});

const baseSeed = Number(process.env.SHAPE_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 200;
const RELATIVE_TOLERANCE = 1e-9;

const close = (actual: unknown, expected: unknown, label: string): void => {
  assert.equal(typeof actual, "number", label);
  assert.equal(typeof expected, "number", label);
  const error = Math.abs(Number(actual) - Number(expected)) / Math.max(Math.abs(Number(expected)), 1);
  assert.ok(error <= RELATIVE_TOLERANCE, `${label}: ${String(actual)} vs ${String(expected)}`);
};

function generatedSample(random: () => number): number[] {
  const length = 4 + Math.floor(random() * 30);
  return Array.from({ length }, () => Math.round((random() * 200 - 50) * 100) / 100);
}

describe(`properties over generated samples (seed ${baseSeed})`, () => {
  it("skewness and kurtosis do not change when the data is shifted or scaled up", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach((_, index) => {
      const sample = generatedSample(random);
      const moved = sample.map((value) => value * 3.5 + 17);
      const label = `seed ${baseSeed} case ${index}`;
      const skew = skewness(sample);
      if (typeof skew === "number") close(skewness(moved), skew, `${label} skew`);
      const kurt = kurtosis(sample);
      if (typeof kurt === "number") close(kurtosis(moved), kurt, `${label} kurt`);
    });
  });

  it("orders the means: harmonic ≤ geometric ≤ arithmetic", () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: GENERATED_CASES }).forEach((_, index) => {
      const sample = generatedSample(random).map((value) => Math.abs(value) + 0.01);
      const arithmetic = sample.reduce((sum, value) => sum + value, 0) / sample.length;
      const [geometric, harmonic] = [geometricMean(sample), harmonicMean(sample)].map(Number);
      const slack = arithmetic * RELATIVE_TOLERANCE;
      assert.ok((harmonic ?? 0) <= (geometric ?? 0) + slack && (geometric ?? 0) <= arithmetic + slack, `seed ${baseSeed} case ${index}`);
    });
  });

  // At the largest value the rank is the share of values below it, which is 1 only when the
  // largest appears once: Excel ranks the 2 in {1, 2, 2} at 0.5.
  it("ranks the smallest value 0 and the largest by the values below it, never decreasing", () => {
    const random = seededRandom(baseSeed + 2);
    Array.from({ length: GENERATED_CASES }).forEach((_, index) => {
      const sample = generatedSample(random);
      const sorted = sample.toSorted((left, right) => left - right);
      const label = `seed ${baseSeed} case ${index}`;
      assert.equal(percentRank(sample, sorted[0] ?? 0, 6), 0, label);
      const largest = sorted.at(-1) ?? 0;
      const belowLargest = sorted.filter((value) => value < largest).length;
      assert.equal(percentRank(sample, largest, 6), Math.floor((belowLargest / (sorted.length - 1)) * 1e6 * (1 + 4 * Number.EPSILON)) / 1e6, label);
      const ranks = sorted.map((value) => Number(percentRank(sample, value, 6)));
      ranks.slice(1).forEach((rank, position) => assert.ok(rank >= (ranks[position] ?? 0), label));
    });
  });
});
