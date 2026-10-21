// MMULT, MINVERSE, MDETERM, MUNIT and FREQUENCY: Microsoft's worked examples, the argument rules,
// and properties that hold for any matrix. Generated cases print their seed; rerun one with
// MATRIX_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type CellValue } from "../../src/engine/index.ts";
import { seededRandom } from "./seededRandom.ts";

/** The table `formula` spills beside `columns` (from column A), as rows from its cell. */
function spilled(formula: string, columns: CellValue[][]): CellValue[][] {
  const height = Math.max(1, ...columns.map((column) => column.length));
  const data = Array.from({ length: height }, (_, row) => columns.map((column) => ({ v: column[row] ?? "" })));
  data[0]?.push({ v: "" }, { v: formula });
  const grid = new SpreadsheetEngine().calculate({ name: "S", data }).data;
  return grid.map((row) => row.slice(columns.length + 1)).filter((row) => row.some((cell) => cell !== ""));
}

/** Columns from rows, as `spilled` takes them. */
const fromRows = (rows: CellValue[][]): CellValue[][] => Array.from({ length: rows[0]?.length ?? 0 }, (_, col) => rows.map((row) => row[col] ?? ""));

const TOLERANCE = 1e-9;
const assertClose = (actual: CellValue[][], expected: number[][], label = ""): void => {
  assert.equal(actual.length, expected.length, label);
  expected.forEach((row, r) =>
    row.forEach((value, c) => {
      const got = actual[r]?.[c];
      assert.ok(
        typeof got === "number" && Math.abs(got - value) <= TOLERANCE * Math.max(1, Math.abs(value)),
        `${label} [${r}][${c}]: ${String(got)} vs ${value}`,
      );
    }),
  );
};

describe("Microsoft's worked examples", () => {
  it("MDETERM, MINVERSE and FREQUENCY", () => {
    const four = [
      [1, 3, 8, 5],
      [1, 3, 6, 1],
      [1, 1, 1, 0],
      [7, 3, 10, 2],
    ];
    assertClose(spilled("=MDETERM(A1:D4)", fromRows(four)), [[88]]);
    assertClose(
      spilled(
        "=MINVERSE(A1:B2)",
        fromRows([
          [4, -1],
          [2, 0],
        ]),
      ),
      [
        [0, 0.5],
        [-1, 2],
      ],
    );
    assertClose(
      spilled(
        "=MINVERSE(A1:C3)",
        fromRows([
          [1, 2, 1],
          [3, 4, -1],
          [0, 2, 0],
        ]),
      ),
      [
        [0.25, 0.25, -0.75],
        [0, 0, 0.5],
        [0.75, -0.25, -0.25],
      ],
    );
    assert.deepEqual(
      spilled("=FREQUENCY(A1:A9,B1:B3)", [
        [79, 85, 78, 85, 50, 81, 95, 88, 97],
        [70, 79, 89],
      ]),
      [[1], [2], [4], [2]],
    );
  });
});

describe("argument rules", () => {
  const square = fromRows([
    [1, 2],
    [3, 4],
  ]);

  it("MMULT multiplies rows by columns and needs the first's width to be the second's height", () => {
    assert.deepEqual(spilled("=MMULT(A1:B2,A1:B2)", square), [
      [7, 10],
      [15, 22],
    ]);
    assert.deepEqual(spilled("=MMULT(A1:B2,A1:A1)", square), [["#VALUE!"]]);
  });

  it("answers #VALUE! for a blank, text or a logical value, and the error an error cell holds", () => {
    ["", "x", true].forEach((bad) => {
      assert.deepEqual(
        spilled("=MDETERM(A1:B2)", [
          [1, bad],
          [2, 4],
        ]),
        [["#VALUE!"]],
        JSON.stringify(bad),
      );
    });
    assert.deepEqual(
      spilled("=MINVERSE(A1:B2)", [
        [1, "=1/0"],
        [2, 4],
      ]),
      [["#DIV/0!"]],
    );
  });

  it("MINVERSE and MDETERM need a square matrix; a singular one has no inverse (#NUM!) and determinant 0", () => {
    assert.deepEqual(spilled("=MDETERM(A1:B1)", square), [["#VALUE!"]]);
    assert.deepEqual(spilled("=MINVERSE(A1:A2)", square), [["#VALUE!"]]);
    const singular = fromRows([
      [1, 2],
      [2, 4],
    ]);
    assert.deepEqual(spilled("=MINVERSE(A1:B2)", singular), [["#NUM!"]]);
    assert.deepEqual(spilled("=MDETERM(A1:B2)", singular), [[0]]);
  });

  it("pivots on the largest entry, so a tiny leading one does not ruin the inverse", () => {
    assertClose(
      spilled(
        "=MINVERSE(A1:B2)",
        fromRows([
          [1e-20, 1],
          [1, 1],
        ]),
      ),
      [
        [-1, 1],
        [1, 0],
      ],
    );
  });

  it("MUNIT is the identity, and needs a size of at least 1", () => {
    assert.deepEqual(spilled("=MUNIT(2)", []), [
      [1, 0],
      [0, 1],
    ]);
    assert.deepEqual(spilled("=MUNIT(0)", []), [["#VALUE!"]]);
    assert.deepEqual(spilled("=MUNIT(100000)", []), [["#VALUE!"]], "larger than a sheet holds");
  });

  it("FREQUENCY keeps the bins in their own order, counts a value on a bin into it, and leaves out text", () => {
    assert.deepEqual(
      spilled("=FREQUENCY(A1:A6,B1:B2)", [
        [1, 5, 5, 9, "x", ""],
        [5, 2],
      ]),
      [[2], [1], [1]],
    );
    assert.deepEqual(
      spilled("=FREQUENCY(A1:A3,B1:B2)", [
        [1, 2, 3],
        ["a", "b"],
      ]),
      [[3]],
    );
    assert.deepEqual(
      spilled("=FREQUENCY(A1:A2,B1:B2)", [
        ["a", "b"],
        [1, 2],
      ]),
      [[0], [0], [0]],
    );
    assert.deepEqual(spilled("=FREQUENCY(A1:A3,2)", [[1, 2, 3]]), [[2], [1]]);
    assert.deepEqual(spilled("=FREQUENCY(A1:A3,2)", [[1, "=1/0", 3]]), [["#DIV/0!"]]);
  });

  it("reads a spilling call's table, and is read by other functions", () => {
    assert.deepEqual(spilled("=MDETERM(MUNIT(3))", []), [[1]]);
    assert.deepEqual(spilled("=SUM(FREQUENCY(SEQUENCE(10),5))", []), [[10]]);
  });
});

const baseSeed = Number(process.env.MATRIX_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 30;

const randomMatrix = (random: () => number, size: number): number[][] =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => Math.round((random() * 20 - 10) * 4) / 4));
const columnLetter = (index: number): string => String.fromCharCode("A".charCodeAt(0) + index);

describe(`properties over generated matrices (seed ${baseSeed})`, () => {
  it("A times its inverse is the identity, and the determinant multiplies", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const size = 1 + Math.floor(random() * 5);
      const [a, b] = [randomMatrix(random, size), randomMatrix(random, size)];
      const last = columnLetter(size - 1);
      const label = `seed ${baseSeed}: ${JSON.stringify([a, b])}`;
      const [detA] = spilled(`=MDETERM(A1:${last}${size})`, fromRows(a))[0] ?? [];
      if (typeof detA !== "number" || Math.abs(detA) < 1e-6) return;
      assertClose(
        spilled(`=MMULT(A1:${last}${size},MINVERSE(A1:${last}${size}))`, fromRows(a)),
        Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_cell, c) => (r === c ? 1 : 0))),
        label,
      );
      const both = fromRows(a.map((row, r) => row.concat(b[r] ?? [])));
      const [left, right] = [`A1:${last}${size}`, `${columnLetter(size)}1:${columnLetter(2 * size - 1)}${size}`];
      const [detProduct] = spilled(`=MDETERM(MMULT(${left},${right}))`, both)[0] ?? [];
      const [detB] = spilled(`=MDETERM(${right})`, both)[0] ?? [];
      const expected = detA * Number(detB);
      assert.ok(
        typeof detProduct === "number" && Math.abs(detProduct - expected) <= 1e-7 * Math.max(1, Math.abs(expected)),
        `${label}: ${String(detProduct)} vs ${expected}`,
      );
    });
  });

  it("FREQUENCY's counts add up to the number of values, whatever the bins", () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const values = Array.from({ length: 1 + Math.floor(random() * 20) }, () => Math.round(random() * 100));
      const bins = Array.from({ length: Math.floor(random() * 5) }, () => Math.round(random() * 100));
      const counts = spilled(`=FREQUENCY(A1:A${values.length},${bins.length === 0 ? "C1" : `B1:B${bins.length}`})`, [values, bins]);
      assert.equal(counts.length, bins.length + 1, `seed ${baseSeed}`);
      assert.equal(
        counts.reduce((sum, [count]) => sum + Number(count), 0),
        values.length,
        `seed ${baseSeed}: ${JSON.stringify([values, bins])}`,
      );
    });
  });
});
