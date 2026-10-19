// Rounding a decimal the way it is written, not the way binary stores it.
// 1.005 is 1.00499999999999989... in a double, so ROUND(1.005, 2) came back 1
// where Excel answers 1.01, and FLOOR(0.3, 0.1) came back 0.2. The generated
// half checks ROUND / ROUNDUP / ROUNDDOWN against exact integer arithmetic on
// the decimal digits; ROUNDING_SEED=<seed> replays a run.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ceilingToSignificance, floorToSignificance, power, roundDownTo, roundTo, roundUpTo } from "../../src/engine/math-ops.ts";
import { DIV_ZERO_ERROR, NUM_ERROR, type SpreadsheetError } from "../../src/engine/spreadsheet-errors.ts";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { cellAt } from "./cellAccess.ts";

describe("rounding works on the written decimal", () => {
  it("ROUND breaks a written half away from zero", () => {
    assert.equal(roundTo(1.005, 2), 1.01);
    assert.equal(roundTo(-1.005, 2), -1.01);
    assert.equal(roundTo(0.285, 2), 0.29);
    assert.equal(roundTo(1.255, 2), 1.26);
  });

  it("ROUNDDOWN and ROUNDUP keep digits that are already exact", () => {
    assert.equal(roundDownTo(523.685, 3), 523.685);
    assert.equal(roundDownTo(-523.685, 3), -523.685);
    assert.equal(roundUpTo(0.1 + 0.2, 1), 0.3);
  });

  it("TRUNC keeps exact digits too", () => {
    const sheet: SheetData = { name: "S", data: [[{ v: "=TRUNC(-523.685, 3)" }]] };
    assert.equal(cellAt(new SpreadsheetEngine().calculate(sheet).data, 0, 0), -523.685);
  });

  it("FLOOR and CEILING land on the multiple the significance names", () => {
    assert.equal(floorToSignificance(0.3, 0.1), 0.3);
    assert.equal(ceilingToSignificance(0.7, 0.1), 0.7);
    assert.equal(floorToSignificance(1.58, 0.1), 1.5);
  });
});

describe("a value with nothing to round is returned as it is", () => {
  const BEYOND_SAFE_INTEGER = 9007199254740992;
  it("an integer above 15 digits keeps its digits", () => {
    assert.equal(roundTo(BEYOND_SAFE_INTEGER, 0), BEYOND_SAFE_INTEGER);
    assert.equal(roundDownTo(BEYOND_SAFE_INTEGER, 0), BEYOND_SAFE_INTEGER);
    assert.equal(floorToSignificance(BEYOND_SAFE_INTEGER, 1e-20), BEYOND_SAFE_INTEGER);
  });

  it("a scale or quotient that overflows does not make Infinity", () => {
    assert.equal(roundTo(1e300, 20), 1e300);
    assert.equal(roundUpTo(1e300, 20), 1e300);
    assert.equal(roundDownTo(-1e300, 20), -1e300);
    assert.equal(floorToSignificance(1e300, 1e-20), 1e300);
    assert.equal(ceilingToSignificance(1e300, 1e-20), 1e300);
  });

  it("digits so negative that the scale underflows give 0, or #NUM! rounding up", () => {
    assert.equal(roundTo(1, -400), 0);
    assert.equal(roundDownTo(-1e-300, -400), 0);
    assert.equal(roundUpTo(1, -400), NUM_ERROR);
    assert.equal(roundUpTo(0, -400), 0);
  });

  it("rounds to tens and hundreds with negative digits", () => {
    assert.equal(roundTo(1235, -1), 1240);
    assert.equal(roundTo(-1235, -1), -1240);
    assert.equal(roundDownTo(1299, -2), 1200);
    assert.equal(roundUpTo(1201, -2), 1300);
  });
});

describe("POWER outside its range is an error, not a number", () => {
  it("0 to a negative power divides by zero", () => {
    assert.equal(power(0, -1), DIV_ZERO_ERROR);
  });

  it("0 to the power 0 is #NUM!", () => {
    assert.equal(power(0, 0), NUM_ERROR);
  });

  it("a result too large for a number is #NUM!, not Infinity", () => {
    assert.equal(power(10, 400), NUM_ERROR);
  });
});

const ROUNDS = 2000;
const MAX_MANTISSA = 1_000_000_000;
const MAX_DECIMALS = 6;
const MAX_NEGATIVE_DIGITS = 3;
const SEED = Number(process.env.ROUNDING_SEED ?? Date.now() % 1_000_000);

const random = (() => {
  let state = SEED;
  return (): number => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
})();
const randomInt = (below: number): number => Math.floor(random() * below);

type Direction = "half" | "up" | "down";

/** `mantissa / 10^decimals` rounded to `digits` decimals, exactly, as the integer count of
 *  10^-digits units. Half and up go away from zero; down goes toward it. */
const exactUnits = (mantissa: bigint, decimals: number, digits: number, direction: Direction): bigint => {
  const dropped = decimals - digits;
  if (dropped <= 0) return mantissa * 10n ** BigInt(-dropped);
  const divisor = 10n ** BigInt(dropped);
  const magnitude = mantissa < 0n ? -mantissa : mantissa;
  const kept = magnitude / divisor;
  const rest = magnitude % divisor;
  const roundsAway = direction === "up" ? rest > 0n : direction === "half" ? rest * 2n >= divisor : false;
  const units = roundsAway ? kept + 1n : kept;
  return mantissa < 0n ? -units : units;
};

const DIRECTIONS: Direction[] = ["half", "up", "down"];
/** A count of 10^-digits units as a number; multiplying by 10^|digits| keeps tens exact,
 *  where dividing by 0.1 would not. */
const fromUnits = (units: bigint, digits: number): number => (digits >= 0 ? Number(units) / 10 ** digits : Number(units) * 10 ** -digits);

const ROUNDERS: Record<Direction, (value: number, digits: number) => number | SpreadsheetError> = { half: roundTo, up: roundUpTo, down: roundDownTo };

describe(`rounding over generated decimals (ROUNDING_SEED=${SEED})`, () => {
  it("ROUND, ROUNDUP and ROUNDDOWN agree with exact decimal arithmetic", () => {
    const failures = Array.from({ length: ROUNDS }, () => {
      const mantissa = BigInt(randomInt(2 * MAX_MANTISSA) - MAX_MANTISSA);
      const decimals = randomInt(MAX_DECIMALS + 1);
      const digits = randomInt(decimals + 1 + MAX_NEGATIVE_DIGITS) - MAX_NEGATIVE_DIGITS;
      const direction = DIRECTIONS[randomInt(DIRECTIONS.length)] ?? "half";
      const value = Number(mantissa) / 10 ** decimals;
      const expected = fromUnits(exactUnits(mantissa, decimals, digits, direction), digits);
      const got = ROUNDERS[direction](value, digits);
      return got === expected ? [] : [`${direction}(${value}, ${digits}) gave ${got}, expected ${expected}`];
    }).flat();
    assert.deepEqual(failures.slice(0, 5), [], `seed ${SEED}: ${failures.length} disagreements`);
  });
});
