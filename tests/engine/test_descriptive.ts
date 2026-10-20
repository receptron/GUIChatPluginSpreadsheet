// TRIMMEAN, AVEDEV, DEVSQ, SKEW.P, PERCENTILE.EXC, QUARTILE.EXC, PERCENTRANK.EXC, RANK.AVG,
// MODE.SNGL, PROB, COUNTBLANK, AVERAGEA, MAXA, MINA, SPEARMAN and KENDALL. Checked against
// Microsoft's worked examples, against numpy and scipy (fixtures/descriptive-reference.json, from
// tests/tools/generate_descriptive_reference.py), and against properties that hold whatever the
// formulas are. Generated cases print their seed; rerun one with DESCRIPTIVE_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  averageDeviation,
  averageRank,
  averageRanks,
  kendall,
  percentileExclusive,
  populationSkewness,
  spearman,
  squaredDeviations,
  trimmedMean,
} from "../../src/engine/functions/descriptive-math.ts";
import { valuesOf } from "./formulaColumns.ts";
import { pick, seededRandom } from "./seededRandom.ts";

const RELATIVE_TOLERANCE = 1e-9;

const assertClose = (actual: unknown, expected: number, label: string): void => {
  assert.equal(typeof actual, "number", `${label}: ${String(actual)}`);
  const error = Math.abs(Number(actual) - expected) / Math.max(Math.abs(expected), 1);
  assert.ok(error <= RELATIVE_TOLERANCE, `${label}: ${String(actual)} vs ${expected}`);
};

const rounded = (digits: number, value: unknown): number => Number(Number(value).toFixed(digits));

describe("Microsoft's worked examples", () => {
  it("TRIMMEAN, AVEDEV, DEVSQ and SKEW.P", () => {
    assert.equal(rounded(6, valuesOf(["=TRIMMEAN(A1:A11,0.2)"], [[4, 5, 6, 7, 2, 3, 4, 5, 1, 2, 3]])[0]), 3.777778);
    assert.equal(rounded(6, valuesOf(["=AVEDEV(A1:A7)"], [[4, 5, 6, 7, 5, 4, 3]])[0]), 1.020408);
    assert.equal(valuesOf(["=DEVSQ(A1:A7)"], [[4, 5, 8, 7, 11, 4, 3]])[0], 48);
    assert.equal(rounded(6, valuesOf(["=SKEW.P(A1:A10)"], [[3, 4, 5, 2, 3, 4, 5, 6, 4, 7]])[0]), 0.303193);
  });

  it("PERCENTILE.EXC, QUARTILE.EXC and PERCENTRANK.EXC", () => {
    const data = [1, 2, 3, 6, 6, 6, 7, 8, 9];
    assert.deepEqual(valuesOf(["=PERCENTILE.EXC(A1:A9,0.25)", "=PERCENTILE.EXC(A1:A9,0)", "=PERCENTILE.EXC(A1:A9,0.01)", "=PERCENTILE.EXC(A1:A9,2)"], [data]), [
      2.5,
      "#NUM!",
      "#NUM!",
      "#NUM!",
    ]);
    assert.deepEqual(valuesOf(["=PERCENTRANK.EXC(A1:A9,7)", "=PERCENTRANK.EXC(A1:A9,5.43)", "=PERCENTRANK.EXC(A1:A9,5.43,1)"], [data]), [0.7, 0.381, 0.3]);
    assert.deepEqual(valuesOf(["=QUARTILE.EXC(A1:A11,1)", "=QUARTILE.EXC(A1:A11,3)"], [[6, 7, 15, 36, 39, 40, 41, 42, 43, 47, 49]]), [15, 43]);
  });

  it("RANK.AVG, MODE.SNGL and PROB, whose bounds may come in either order", () => {
    assert.equal(valuesOf(["=RANK.AVG(94,A1:A7)"], [[89, 88, 92, 101, 94, 97, 95]])[0], 4);
    assert.equal(valuesOf(["=MODE.SNGL(A1:A6)"], [[5.6, 4, 4, 3, 2, 4]])[0], 4);
    assert.deepEqual(
      valuesOf(
        ["=PROB(A1:A4,B1:B4,2)", "=PROB(A1:A4,B1:B4,1,3)", "=PROB(A1:A4,B1:B4,3,1)"],
        [
          [0, 1, 2, 3],
          [0.2, 0.3, 0.1, 0.4],
        ],
      ),
      [0.1, 0.8, 0.8],
    );
  });

  it("AVERAGEA, MAXA and MINA count text as 0 and TRUE as 1", () => {
    assert.deepEqual(valuesOf(["=AVERAGEA(A1:A5)", "=MAXA(A1:A3)", "=MINA(A1:A3)"], [[10, 7, 9, 2, "Not available"]]), [5.6, 10, 7]);
    // A cell holding the text "TRUE" is text, so it counts 0; a cell answering TRUE counts 1.
    assert.deepEqual(valuesOf(["=MAXA(A1:A3)", "=MINA(A1:A3)", "=AVERAGEA(A1:A3)"], [[-1, 0.5, "TRUE"]]), [0.5, -1, -0.5 / 3]);
    assert.deepEqual(valuesOf(["=MAXA(A1:A2)", "=AVERAGEA(A1:A2)"], [[-1, "=1=1"]]), [1, 0]);
    assert.deepEqual(valuesOf(["=AVERAGEA(A1:A3)", "=MINA(A1:A3)"], [[2, "", 4]]), [3, 2], "a blank is not counted");
  });
});

describe("argument rules", () => {
  it("TRIMMEAN refuses a percent outside 0 to 1 and no values", () => {
    assert.deepEqual(valuesOf(["=TRIMMEAN(A1:A3,-0.1)", "=TRIMMEAN(A1:A3,1)", "=TRIMMEAN(D1:D3,0.2)", "=TRIMMEAN(A1:A3,0)"], [[1, 2, 6]]), [
      "#NUM!",
      "#NUM!",
      "#NUM!",
      3,
    ]);
  });

  it("AVEDEV and DEVSQ need a value, SKEW.P one that varies", () => {
    assert.deepEqual(valuesOf(["=AVEDEV(D1:D2)", "=DEVSQ(D1:D2)", "=SKEW.P(A1:A3)", "=SKEW.P(D1:D2)"], [[2, 2, 2]]), ["#NUM!", "#NUM!", "#DIV/0!", "#DIV/0!"]);
  });

  it("QUARTILE.EXC takes 1 to 3, truncated", () => {
    assert.deepEqual(valuesOf(["=QUARTILE.EXC(A1:A5,0)", "=QUARTILE.EXC(A1:A5,4)", "=QUARTILE.EXC(A1:A5,2.9)"], [[1, 2, 3, 4, 5]]), ["#NUM!", "#NUM!", 3]);
  });

  it("PERCENTRANK.EXC is #N/A outside the data and #NUM! below one digit", () => {
    assert.deepEqual(valuesOf(["=PERCENTRANK.EXC(A1:A3,0)", "=PERCENTRANK.EXC(A1:A3,4)", "=PERCENTRANK.EXC(A1:A3,2,0)"], [[1, 2, 3]]), [
      "#N/A",
      "#N/A",
      "#NUM!",
    ]);
  });

  it("RANK.AVG is #N/A for a number the range does not hold, and ranks ascending on request", () => {
    assert.deepEqual(valuesOf(["=RANK.AVG(5,A1:A4)", "=RANK.AVG(2,A1:A4,1)", "=RANK.AVG(2,A1:A4)"], [[1, 2, 2, 3]]), ["#N/A", 2.5, 2.5]);
  });

  it("PROB refuses probabilities that are out of range or do not sum to 1, and ranges of different sizes", () => {
    assert.deepEqual(
      valuesOf(
        ["=PROB(A1:A2,B1:B2,1)", "=PROB(A1:A2,C1:C2,1)", "=PROB(A1:A2,B1:B1,1)", "=PROB(A1:A3,D1:D3,1,2)"],
        [
          [1, 2, 3],
          [0.5, 0.6],
          [1.5, -0.5],
          [0.1, 0.2, 0.7],
        ],
      ),
      ["#NUM!", "#NUM!", "#N/A", 0.1 + 0.2],
    );
  });

  it('COUNTBLANK counts empty cells, a formula that answers "", and cells past the data', () => {
    assert.deepEqual(valuesOf(["=COUNTBLANK(A1:A6)", "=COUNTBLANK(A1:A1)"], [[1, "", '=IF(TRUE,"",1)', "x", 0]]), [3, 0]);
  });

  it("SPEARMAN and KENDALL need two pairs that vary", () => {
    assert.deepEqual(
      valuesOf(
        ["=SPEARMAN(A1:A1,B1:B1)", "=KENDALL(A1:A3,C1:C3)", "=SPEARMAN(A1:A3,B1:B2)"],
        [
          [1, 2, 3],
          [4, 5, 6],
          [7, 7, 7],
        ],
      ),
      ["#DIV/0!", "#DIV/0!", "#N/A"],
    );
  });

  it("answers the first error in a range", () => {
    assert.deepEqual(
      valuesOf(
        ["=TRIMMEAN(A1:A3,0.1)", "=AVEDEV(A1:A3)", "=SPEARMAN(A1:A3,B1:B3)", "=AVERAGEA(A1:A3)", "=RANK.AVG(1,A1:A3)"],
        [
          [1, "=1/0", 3],
          [3, 2, 1],
        ],
      ),
      ["#DIV/0!", "#DIV/0!", "#DIV/0!", "#DIV/0!", "#DIV/0!"],
    );
  });
});

interface ReferenceCase {
  xs: number[];
  ys: number[];
  k: number;
  percentileExc: number;
  skewP: number;
  avedev: number;
  devsq: number;
  rankTarget: number;
  rankAvgDescending: number;
  spearman: number;
  kendall: number;
}

const isReferenceCase = (value: unknown): value is ReferenceCase =>
  typeof value === "object" && value !== null && Array.isArray(Reflect.get(value, "xs")) && typeof Reflect.get(value, "kendall") === "number";

const parsed: unknown = JSON.parse(readFileSync(new URL("./fixtures/descriptive-reference.json", import.meta.url), "utf8"));
const referenceCases: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "cases") : undefined;
assert.ok(Array.isArray(referenceCases) && referenceCases.every(isReferenceCase), "the reference fixture holds cases");
const cases: ReferenceCase[] = referenceCases.filter(isReferenceCase);

describe("against numpy and scipy", () => {
  it("PERCENTILE.EXC, SKEW.P, AVEDEV and DEVSQ", () => {
    cases.forEach(({ xs, k, percentileExc, skewP, avedev, devsq }, index) => {
      assertClose(percentileExclusive(xs, k), percentileExc, `case ${index} PERCENTILE.EXC`);
      assertClose(populationSkewness(xs), skewP, `case ${index} SKEW.P`);
      assertClose(averageDeviation(xs), avedev, `case ${index} AVEDEV`);
      assertClose(squaredDeviations(xs), devsq, `case ${index} DEVSQ`);
    });
  });

  it("RANK.AVG, SPEARMAN and KENDALL", () => {
    cases.forEach(({ xs, ys, rankTarget, rankAvgDescending, spearman: rho, kendall: tau }, index) => {
      assertClose(averageRank(rankTarget, xs, false), rankAvgDescending, `case ${index} RANK.AVG`);
      assertClose(spearman({ ys: xs, xs: ys }), rho, `case ${index} SPEARMAN`);
      assertClose(kendall({ ys: xs, xs: ys }), tau, `case ${index} KENDALL`);
    });
  });

  it("through the engine, as the same cells read by formulas", () => {
    cases.slice(0, 10).forEach(({ xs, ys, k, percentileExc, spearman: rho, kendall: tau }, index) => {
      const end = xs.length;
      const [percentile, rhoValue, tauValue] = valuesOf(
        [`=PERCENTILE.EXC(A1:A${end},${k})`, `=SPEARMAN(A1:A${end},B1:B${end})`, `=KENDALL(A1:A${end},B1:B${end})`],
        [xs, ys],
      );
      assertClose(percentile, percentileExc, `case ${index}`);
      assertClose(rhoValue, rho, `case ${index}`);
      assertClose(tauValue, tau, `case ${index}`);
    });
  });
});

const baseSeed = Number(process.env.DESCRIPTIVE_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 200;

function generatedSample(random: () => number): number[] {
  return Array.from({ length: 3 + Math.floor(random() * 30) }, () => Math.round((random() * 100 - 30) * pick(random, [1, 10])) / 10);
}

describe(`properties over generated samples (seed ${baseSeed})`, () => {
  it("TRIMMEAN with nothing trimmed is the mean, and does not depend on the order", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach((_, index) => {
      const sample = generatedSample(random);
      const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
      const label = `seed ${baseSeed} case ${index}`;
      assertClose(trimmedMean(sample, 0), mean, label);
      const percent = random() * 0.99;
      assertClose(trimmedMean(sample.toReversed(), percent), Number(trimmedMean(sample, percent)), label);
    });
  });

  it("the average ranks sum to n(n+1)/2, and the ranks of a sorted list are 1 to n without ties", () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: GENERATED_CASES }).forEach((_, index) => {
      const sample = generatedSample(random);
      const ranks = averageRanks(sample);
      assertClose(
        ranks.reduce((sum, rank) => sum + rank, 0),
        (sample.length * (sample.length + 1)) / 2,
        `seed ${baseSeed} case ${index}`,
      );
      const distinct = [...new Set(sample)].toSorted((left, right) => left - right);
      assert.deepEqual(
        averageRanks(distinct),
        distinct.map((_value, position) => position + 1),
      );
    });
  });

  it("SPEARMAN and KENDALL are 1 for a rising transform and flip sign when one side is reversed", () => {
    const random = seededRandom(baseSeed + 2);
    Array.from({ length: GENERATED_CASES }).forEach((_, index) => {
      const xs = [...new Set(generatedSample(random))];
      if (xs.length < 2) return;
      const label = `seed ${baseSeed} case ${index}`;
      const rising = xs.map((x) => x ** 3 + 2 * x);
      assertClose(spearman({ ys: xs, xs: rising }), 1, label);
      assertClose(kendall({ ys: xs, xs: rising }), 1, label);
      const ys = generatedSample(random).slice(0, xs.length);
      if (ys.length < xs.length) return;
      const [rho, tau] = [spearman({ ys: xs, xs: ys }), kendall({ ys: xs, xs: ys })];
      if (typeof rho === "number") assertClose(spearman({ ys: xs, xs: ys.map((y) => -y) }), -rho, label);
      if (typeof tau === "number") assertClose(kendall({ ys: xs, xs: ys.map((y) => -y) }), -tau, label);
    });
  });
});
