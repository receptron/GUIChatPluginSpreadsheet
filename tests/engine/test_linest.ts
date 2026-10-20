// LINEST, LOGEST, TREND over several x and GROWTH: against exact references
// (tests/tools/generate_linest_reference.py, which also reproduces Microsoft's worked examples),
// against the argument rules, and against properties that hold for any data. Generated cases print
// their seed; rerun one with LINEST_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SpreadsheetEngine, type CellValue } from "../../src/engine/index.ts";
import { indexToColumn } from "../../src/engine/parser.ts";
import { seededRandom } from "./seededRandom.ts";

const RELATIVE_TOLERANCE = 1e-9;

interface ReferenceCase {
  fn: string;
  y: number[][];
  x: number[][] | null;
  newX?: number[][];
  const: boolean;
  stats?: boolean;
  expected: (number | string)[][];
}

const isReferenceCase = (value: unknown): value is ReferenceCase => typeof value === "object" && value !== null && "fn" in value && "expected" in value;
const parsed: unknown = JSON.parse(readFileSync(new URL("./fixtures/linest-reference.json", import.meta.url), "utf8"));
const REFERENCE: ReferenceCase[] = Array.isArray(parsed) ? parsed.filter(isReferenceCase) : [];

/** Grids laid side by side from A1, a column apart, with `formula` written below them all. Answers
 *  each grid's range and what the formula spills. */
function spilledBeside(grids: CellValue[][][], formulaOf: (ranges: string[]) => string): CellValue[][] {
  const height = Math.max(1, ...grids.map((grid) => grid.length));
  const rows: CellValue[][] = Array.from({ length: height + 1 }, () => []);
  const ranges = grids.map((grid, index) => {
    const left = grids.slice(0, index).reduce((col, earlier) => col + (earlier[0]?.length ?? 0) + 1, 0);
    grid.forEach((cells, r) =>
      cells.forEach((value, c) => {
        const target = rows[r];
        if (target) target[left + c] = value;
      }),
    );
    return `${indexToColumn(left)}1:${indexToColumn(left + (grid[0]?.length ?? 1) - 1)}${grid.length}`;
  });
  rows.push([formulaOf(ranges)]);
  const filled = rows.map((row) => Array.from({ length: Math.max(row.length, 1) }, (_, c) => ({ v: row[c] ?? "" })));
  const [sheet] = new SpreadsheetEngine().calculateWorkbook([{ name: "S", data: filled }]);
  return (sheet?.data.slice(height + 1) ?? []).filter((row) => row.some((cell) => cell !== ""));
}

const flag = (value: boolean): string => (value ? "TRUE" : "FALSE");

function formulaFor(reference: ReferenceCase): { grids: CellValue[][][]; formulaOf: (ranges: string[]) => string } {
  const grids: CellValue[][][] = [reference.y, ...(reference.x ? [reference.x] : []), ...(reference.newX ? [reference.newX] : [])];
  const formulaOf = (ranges: string[]): string => {
    const [y, ...rest] = ranges;
    const x = reference.x ? rest.shift() : "";
    if (reference.newX) return `=${reference.fn}(${y},${x},${rest[0]},${flag(reference.const)})`;
    return `=${reference.fn}(${y},${x},${flag(reference.const)},${flag(reference.stats ?? false)})`;
  };
  return { grids, formulaOf };
}

const assertTableClose = (actual: CellValue[][], expected: (number | string)[][], label: string): void => {
  assert.equal(actual.length, expected.length, `${label}: rows ${JSON.stringify(actual)}`);
  expected.forEach((row, r) =>
    row.forEach((value, c) => {
      const got = actual[r]?.[c];
      if (typeof value === "string") {
        assert.equal(got, value, `${label} [${r}][${c}]`);
        return;
      }
      const error = Math.abs(Number(got) - value) / Math.max(Math.abs(value), 1);
      assert.ok(typeof got === "number" && error <= RELATIVE_TOLERANCE, `${label} [${r}][${c}]: ${String(got)} vs ${value}`);
    }),
  );
};

describe("against the exact references", () => {
  REFERENCE.forEach((reference, index) => {
    it(`${reference.fn} case ${index}`, () => {
      const { grids, formulaOf } = formulaFor(reference);
      assertTableClose(spilledBeside(grids, formulaOf), reference.expected, `${reference.fn} ${JSON.stringify(reference)}`);
    });
  });
});

const column = (values: CellValue[]): CellValue[][] => values.map((value) => [value]);

describe("the argument rules", () => {
  const ys = column([3, 5, 9, 11]);
  const xs = column([1, 2, 4, 5]);

  it("LINEST without stats is one row, and with const FALSE has a constant of 0", () => {
    assertTableClose(
      spilledBeside([ys, xs], ([y, x]) => `=LINEST(${y},${x})`),
      [[2, 1]],
      "y = 2x + 1",
    );
    assert.deepEqual(spilledBeside([ys, xs], ([y, x]) => `=LINEST(${y},${x},FALSE)`)[0]?.[1], 0);
  });

  it("answers #REF! for x of another shape, #VALUE! for a blank or text, and an error cell's error", () => {
    assert.deepEqual(
      spilledBeside([ys, column([1, 2, 3])], ([y, x]) => `=LINEST(${y},${x})`),
      [["#REF!"]],
    );
    assert.deepEqual(
      spilledBeside([ys, column([1, "", 3, 4])], ([y, x]) => `=LINEST(${y},${x})`),
      [["#VALUE!"]],
    );
    assert.deepEqual(
      spilledBeside([ys, column([1, "x", 3, 4])], ([y, x]) => `=LINEST(${y},${x})`),
      [["#VALUE!"]],
    );
    assert.deepEqual(
      spilledBeside([ys, column([1, "=1/0", 3, 4])], ([y, x]) => `=LINEST(${y},${x})`),
      [["#DIV/0!"]],
    );
  });

  it("LOGEST and GROWTH need every y above 0", () => {
    assert.deepEqual(
      spilledBeside([column([3, 0, 9, 11]), xs], ([y, x]) => `=LOGEST(${y},${x})`),
      [["#NUM!"]],
    );
    assert.deepEqual(
      spilledBeside([column([3, -1, 9, 11]), xs], ([y, x]) => `=GROWTH(${y},${x},5)`),
      [["#NUM!"]],
    );
  });

  it("TREND and GROWTH answer at known_x when new_x is left out, and one value per new x of one variable", () => {
    assertTableClose(
      spilledBeside([ys, xs], ([y, x]) => `=TREND(${y},${x})`),
      [[3], [5], [9], [11]],
      "the line at each known x",
    );
    assertTableClose(
      spilledBeside([ys, xs, [[6, 7]]], ([y, x, newX]) => `=TREND(${y},${x},${newX})`),
      [[13, 15]],
      "a row of new x",
    );
    assertTableClose(
      spilledBeside([column([2, 4, 8, 16])], ([y]) => `=GROWTH(${y},,5)`),
      [[32]],
      "doubling",
    );
  });

  it("TREND left without x and new_x fits 1, 2, 3, … laid out as known_y is", () => {
    assertTableClose(
      spilledBeside(
        [
          [
            [2, 4],
            [6, 8],
          ],
        ],
        ([y]) => `=TREND(${y})`,
      ),
      [
        [2, 4],
        [6, 8],
      ],
      "y = 2x at x = 1, 2, 3, 4",
    );
  });

  it("TREND passes an error cell in new_x through, and reads one new x as it always has", () => {
    assert.deepEqual(
      spilledBeside([ys, xs, column([6, "=1/0"])], ([y, x, newX]) => `=TREND(${y},${x},${newX})`),
      [["#DIV/0!"]],
    );
    // At one new x, the new x is read first: its #VALUE! comes before known_y's error.
    assert.deepEqual(
      spilledBeside([column([3, "=1/0", 9, 11]), xs], ([y, x]) => `=TREND(${y},${x},"x")`),
      [["#VALUE!"]],
    );
  });

  it("TREND over variables in rows wants one row of new_x per variable", () => {
    const rowY = [[3, 5, 9, 11, 16]];
    const rowXs = [
      [1, 2, 4, 5, 7],
      [0, 1, 1, 3, 2],
    ];
    assert.deepEqual(
      spilledBeside([rowY, rowXs, [[1], [2], [3]]], ([y, x, newX]) => `=TREND(${y},${x},${newX})`),
      [["#REF!"]],
    );
  });

  it("TREND over several variables wants one value per variable in each row of new_x", () => {
    const twoXs = [
      [1, 0],
      [2, 1],
      [4, 1],
      [5, 3],
    ];
    assert.deepEqual(
      spilledBeside([ys, twoXs, [[1, 2, 3]]], ([y, x, newX]) => `=TREND(${y},${x},${newX})`),
      [["#REF!"]],
    );
  });
});

const baseSeed = Number(process.env.LINEST_SEED ?? Date.now() % 1_000_000);

describe(`properties over generated data (seed ${baseSeed})`, () => {
  it("TREND at the known x of several variables is LINEST's coefficients applied to them, and the residuals sum to 0 with a constant", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: 12 }).forEach(() => {
      const variables = 2 + Math.floor(random() * 2);
      const count = variables + 2 + Math.floor(random() * 5);
      const x = Array.from({ length: count }, () => Array.from({ length: variables }, () => Math.round(random() * 200 - 100) / 10));
      const y = column(Array.from({ length: count }, () => Math.round(random() * 400 - 200) / 10));
      const label = `seed ${baseSeed}: ${JSON.stringify([y, x])}`;
      const [coefficients = []] = spilledBeside([y, x], ([ys, xs]) => `=LINEST(${ys},${xs})`);
      const fitted = spilledBeside([y, x], ([ys, xs]) => `=TREND(${ys},${xs})`).map((row) => Number(row[0]));
      const intercept = Number(coefficients[variables]);
      const byHand = x.map((row) => row.reduce((sum, value, index) => sum + value * Number(coefficients[variables - 1 - index]), intercept));
      fitted.forEach((value, index) => assert.ok(Math.abs(value - (byHand[index] ?? 0)) <= 1e-9 * Math.max(1, Math.abs(value)), label));
      const residualSum = y.reduce((sum, [value], index) => sum + Number(value) - (fitted[index] ?? 0), 0);
      assert.ok(Math.abs(residualSum) <= 1e-8, `${label}: residuals sum to ${residualSum}`);
    });
  });

  it("TREND at a column of new x answers, cell for cell, exactly what TREND at each x alone answers", () => {
    const random = seededRandom(baseSeed + 2);
    Array.from({ length: 12 }).forEach(() => {
      const count = 2 + Math.floor(random() * 6);
      const y = column(Array.from({ length: count }, () => Math.round(random() * 400 - 200) / 10));
      const x = column(Array.from({ length: count }, () => Math.round(random() * 200 - 100) / 10));
      const newX = column(Array.from({ length: 3 }, () => Math.round(random() * 300 - 150) / 10));
      const constant = random() < 0.5 ? "TRUE" : "FALSE";
      const table = spilledBeside([y, x, newX], ([ys, xs, news]) => `=TREND(${ys},${xs},${news},${constant})`).map((row) => row[0]);
      const one = newX.map((_, index) => spilledBeside([y, x, newX], ([ys, xs]) => `=TREND(${ys},${xs},${indexToColumn(4)}${index + 1},${constant})`)[0]?.[0]);
      assert.deepEqual(table, one, `seed ${baseSeed}: ${JSON.stringify([y, x, newX, constant])}`);
    });
  });

  it("LOGEST's bases are e to LINEST's coefficients over ln y", () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: 12 }).forEach(() => {
      const count = 3 + Math.floor(random() * 6);
      const x = column(Array.from({ length: count }, () => Math.round(random() * 100) / 10));
      const y = column(Array.from({ length: count }, () => 1 + Math.round(random() * 500) / 10));
      const logs = y.map(([value]) => [Math.log(Number(value))]);
      const [bases = []] = spilledBeside([y, x], ([ys, xs]) => `=LOGEST(${ys},${xs})`);
      const [line = []] = spilledBeside([logs, x], ([ys, xs]) => `=LINEST(${ys},${xs})`);
      line.forEach((value, index) =>
        assert.ok(Math.abs(Math.exp(Number(value)) - Number(bases[index])) <= 1e-9 * Math.abs(Number(bases[index])), `seed ${baseSeed}`),
      );
    });
  });
});
