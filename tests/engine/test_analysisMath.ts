// The expected values are the worked examples in Microsoft's documentation for
// each Excel function, so they check the rules against Excel rather than
// against this code.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  correlation,
  intercept,
  kthLargest,
  kthSmallest,
  numericPairs,
  percentileInclusive,
  populationStdev,
  populationVariance,
  quartileInclusive,
  rankOf,
  rowsMeetingAll,
  rSquared,
  slope,
  type NumericPairs,
} from "../../src/engine/functions/analysis-math.ts";
import { DIV_ZERO_ERROR, NA_ERROR, NUM_ERROR, VALUE_ERROR } from "../../src/engine/spreadsheet-errors.ts";

const TOLERANCE = 1e-6;

const assertClose = (actual: unknown, expected: number): void => {
  assert.equal(typeof actual, "number", `expected a number, got ${String(actual)}`);
  assert.ok(Math.abs(Number(actual) - expected) < TOLERANCE, `${String(actual)} is not ${expected}`);
};

const pairsOf = (ys: number[], xs: number[]): NumericPairs => ({ ys, xs });

// SLOPE / RSQ documentation data.
const REGRESSION = pairsOf([2, 3, 9, 1, 8, 7, 5], [6, 5, 11, 7, 5, 4, 4]);

describe("numericPairs", () => {
  it("keeps the pairs where both sides hold a number, in order", () => {
    assert.deepEqual(numericPairs([1, "", 3, "x", 5], [10, 20, "", 40, "50"]), pairsOf([1, 5], [10, 50]));
  });

  it("treats a boolean as no number", () => {
    assert.deepEqual(numericPairs([true, 2], [1, 2]), pairsOf([2], [2]));
  });

  it("answers #N/A for ranges of different sizes", () => {
    assert.equal(numericPairs([1, 2, 3], [1, 2]), NA_ERROR);
  });

  it("pairs two empty ranges as nothing", () => {
    assert.deepEqual(numericPairs([], []), pairsOf([], []));
  });
});

describe("correlation and regression", () => {
  it("CORREL documentation example", () => {
    assertClose(correlation(pairsOf([3, 2, 4, 5, 6], [9, 7, 12, 15, 17])), 0.997054486);
  });

  it("SLOPE and RSQ documentation examples", () => {
    assertClose(slope(REGRESSION), 0.305556);
    assertClose(rSquared(REGRESSION), 0.05795);
  });

  it("INTERCEPT documentation example", () => {
    assertClose(intercept(pairsOf([2, 3, 9, 1, 8], [6, 5, 11, 7, 5])), 0.0483871);
  });

  it("a perfect negative line correlates at -1 with its slope and intercept", () => {
    const line = pairsOf([7, 5, 3, 1], [1, 2, 3, 4]);
    assertClose(correlation(line), -1);
    assertClose(slope(line), -2);
    assertClose(intercept(line), 9);
  });

  it("answers #DIV/0! for fewer than two pairs", () => {
    [pairsOf([], []), pairsOf([1], [1])].forEach((pairs) => {
      assert.equal(correlation(pairs), DIV_ZERO_ERROR);
      assert.equal(slope(pairs), DIV_ZERO_ERROR);
      assert.equal(intercept(pairs), DIV_ZERO_ERROR);
      assert.equal(rSquared(pairs), DIV_ZERO_ERROR);
    });
  });

  it("answers #DIV/0! when x never varies", () => {
    const flatX = pairsOf([1, 2, 3], [5, 5, 5]);
    assert.equal(correlation(flatX), DIV_ZERO_ERROR);
    assert.equal(slope(flatX), DIV_ZERO_ERROR);
    assert.equal(intercept(flatX), DIV_ZERO_ERROR);
  });

  it("answers #DIV/0! for CORREL when only y never varies, but SLOPE is 0", () => {
    const flatY = pairsOf([4, 4, 4], [1, 2, 3]);
    assert.equal(correlation(flatY), DIV_ZERO_ERROR);
    assert.equal(slope(flatY), 0);
    assert.equal(intercept(flatY), 4);
  });
});

describe("percentileInclusive and quartileInclusive", () => {
  it("PERCENTILE documentation example", () => {
    assertClose(percentileInclusive([1, 3, 2, 4], 0.3), 1.9);
  });

  it("QUARTILE documentation example", () => {
    assertClose(quartileInclusive([1, 2, 4, 7, 8, 9, 10, 12], 1), 3.5);
  });

  it("interpolates like QUARTILE.INC, not like an exclusive method", () => {
    assertClose(quartileInclusive([1, 2, 3, 4], 1), 1.75);
    assertClose(quartileInclusive([1, 2, 3, 4], 3), 3.25);
  });

  it("returns the minimum at 0 and the maximum at 1, whatever the order", () => {
    assert.equal(percentileInclusive([5, 1, 9], 0), 1);
    assert.equal(percentileInclusive([5, 1, 9], 1), 9);
    assert.equal(quartileInclusive([5, 1, 9], 4), 9);
  });

  it("does not reorder the caller's list", () => {
    const values = [3, 1, 2];
    percentileInclusive(values, 0.5);
    assert.deepEqual(values, [3, 1, 2]);
  });

  it("truncates a fractional quarter", () => {
    assert.equal(quartileInclusive([1, 2, 3, 4, 5], 2.9), 3);
  });

  it("answers #NUM! outside the range or with no values", () => {
    assert.equal(percentileInclusive([1, 2], -0.1), NUM_ERROR);
    assert.equal(percentileInclusive([1, 2], 1.1), NUM_ERROR);
    assert.equal(percentileInclusive([], 0.5), NUM_ERROR);
    assert.equal(quartileInclusive([1, 2], 5), NUM_ERROR);
    assert.equal(quartileInclusive([1, 2], -1), NUM_ERROR);
  });

  it("returns the single value for any k", () => {
    assert.equal(percentileInclusive([7], 0.42), 7);
  });
});

describe("kthLargest and kthSmallest", () => {
  const LARGE_DATA = [3, 5, 3, 5, 4, 4, 2, 4, 6, 7];

  it("LARGE documentation examples", () => {
    assert.equal(kthLargest(LARGE_DATA, 3), 5);
    assert.equal(kthLargest(LARGE_DATA, 7), 4);
  });

  it("SMALL documentation examples", () => {
    assert.equal(kthSmallest([3, 4, 5, 2, 3, 4, 5, 6, 4, 7], 4), 4);
    assert.equal(kthSmallest([1, 4, 8, 3, 7, 12, 54, 8, 23], 2), 3);
  });

  it("rounds a fractional k up", () => {
    assert.equal(kthLargest([10, 20, 30], 1.2), 20);
    assert.equal(kthSmallest([10, 20, 30], 1.2), 20);
  });

  it("answers #NUM! for k outside 1..n", () => {
    [0, -1, 4].forEach((k) => {
      assert.equal(kthLargest([1, 2, 3], k), NUM_ERROR);
      assert.equal(kthSmallest([1, 2, 3], k), NUM_ERROR);
    });
    assert.equal(kthLargest([], 1), NUM_ERROR);
  });
});

describe("rankOf", () => {
  const RANK_DATA = [7, 3.5, 3.5, 1, 2];

  it("RANK documentation examples", () => {
    assert.equal(rankOf(3.5, RANK_DATA, false), 2);
    assert.equal(rankOf(7, RANK_DATA, true), 5);
  });

  it("gives equal values the same rank, and skips the next", () => {
    assert.equal(rankOf(2, RANK_DATA, false), 4);
    assert.equal(rankOf(2, RANK_DATA, true), 2);
  });

  it("answers #N/A for a number the list does not hold", () => {
    assert.equal(rankOf(5, RANK_DATA, false), NA_ERROR);
    assert.equal(rankOf(1, [], false), NA_ERROR);
  });
});

describe("population spread", () => {
  const STDEVP_DATA = [1345, 1301, 1368, 1322, 1310, 1370, 1318, 1350, 1303, 1299];

  it("STDEVP and VARP documentation examples", () => {
    assertClose(populationStdev(STDEVP_DATA), 26.05455814);
    assertClose(populationVariance(STDEVP_DATA), 678.84);
  });

  it("is 0 for one value, where the sample versions are #DIV/0!", () => {
    assert.equal(populationVariance([5]), 0);
    assert.equal(populationStdev([5]), 0);
  });

  it("answers #DIV/0! with no values", () => {
    assert.equal(populationVariance([]), DIV_ZERO_ERROR);
    assert.equal(populationStdev([]), DIV_ZERO_ERROR);
  });
});

const isEast = (value: unknown): boolean => value === "East";

const overTen = (value: unknown): boolean => typeof value === "number" && value > 10;

describe("rowsMeetingAll", () => {
  it("marks the rows that meet every condition", () => {
    const conditions = [
      { range: ["East", "West", "East", "East"], matches: isEast },
      { range: [5, 20, 15, ""], matches: overTen },
    ];
    assert.deepEqual(rowsMeetingAll(4, conditions), [false, false, true, false]);
  });

  it("answers #VALUE! when a range is not the size of the first", () => {
    assert.equal(rowsMeetingAll(3, [{ range: ["East", "East"], matches: isEast }]), VALUE_ERROR);
  });

  it("marks nothing for an empty range", () => {
    assert.deepEqual(rowsMeetingAll(0, [{ range: [], matches: isEast }]), []);
  });
});
