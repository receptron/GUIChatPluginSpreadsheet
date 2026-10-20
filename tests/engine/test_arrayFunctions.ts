// SORT, SORTBY, UNIQUE, SEQUENCE, TRANSPOSE, CHOOSECOLS, CHOOSEROWS, HSTACK, VSTACK, TAKE, DROP and
// XMATCH: each table spills from the formula's cell. Checked against Excel's rules, and against
// properties that hold whatever the table. Generated cases print their seed; rerun one with
// ARRAY_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type CellValue } from "../../src/engine/index.ts";
import { pick, seededRandom, type Random } from "./seededRandom.ts";

/** The table `formula` spills, written beside `columns` (from column A), as rows from its cell. */
function spilled(formula: string, columns: CellValue[][]): CellValue[][] {
  const height = Math.max(1, ...columns.map((column) => column.length));
  const data = Array.from({ length: height }, (_, row) => columns.map((column) => ({ v: column[row] ?? "" })));
  data[0]?.push({ v: "" }, { v: formula });
  const anchorColumn = columns.length + 1;
  const grid = new SpreadsheetEngine().calculate({ name: "S", data }).data;
  return grid.map((row) => row.slice(anchorColumn)).filter((row) => row.some((cell) => cell !== ""));
}

const NAMES = ["b", "A", "c", "a", "", 3, true];
const NUMBERS = [2, 1, 3, 1, 5, 4, 0];

describe("SORT and SORTBY", () => {
  it("orders numbers, then text without regard to case, then logical values, a blank as 0", () => {
    assert.deepEqual(spilled("=SORT(A1:A7)", [NAMES]), [[0], [3], ["A"], ["a"], ["b"], ["c"], [true]]);
  });

  it("sorts by the column asked for, descending with -1, ties kept in order", () => {
    assert.deepEqual(spilled("=SORT(A1:B7,2,-1)", [NAMES, NUMBERS]), [
      [0, 5],
      [3, 4],
      ["c", 3],
      ["b", 2],
      ["A", 1],
      ["a", 1],
      [true, 0],
    ]);
  });

  it("sorts columns by a row with by_col", () => {
    assert.deepEqual(spilled("=SORT(A1:C1,1,1,TRUE)", [[3], [1], [2]]), [[1, 2, 3]]);
  });

  it("keeps errors last, whichever way it sorts", () => {
    assert.deepEqual(spilled("=SORT(A1:A3,1,-1)", [[1, "=1/0", 2]]), [[2], [1], ["#DIV/0!"]]);
  });

  it("answers #VALUE! for a column outside the table or an order other than 1 and -1", () => {
    assert.deepEqual(spilled("=SORT(A1:A3,2)", [[1, 2, 3]]), [["#VALUE!"]]);
    assert.deepEqual(spilled("=SORT(A1:A3,1,0)", [[1, 2, 3]]), [["#VALUE!"]]);
  });

  it("SORTBY orders by other ranges in turn, which must match the table's height", () => {
    assert.deepEqual(
      spilled("=SORTBY(A1:A4,B1:B4,1,C1:C4,-1)", [
        ["w", "x", "y", "z"],
        [2, 1, 2, 1],
        [1, 2, 3, 4],
      ]),
      [["z"], ["x"], ["y"], ["w"]],
    );
    assert.deepEqual(
      spilled("=SORTBY(A1:A4,B1:B3)", [
        ["w", "x", "y", "z"],
        [2, 1, 2],
      ]),
      [["#VALUE!"]],
    );
  });
});

describe("UNIQUE", () => {
  it("keeps the first of rows that are the same without regard to case", () => {
    assert.deepEqual(spilled("=UNIQUE(A1:A4)", [NAMES]), [["b"], ["A"], ["c"]]);
    assert.deepEqual(
      spilled("=UNIQUE(A1:B4)", [
        ["x", "x", "y", "X"],
        [1, 2, 1, 1],
      ]),
      [
        ["x", 1],
        ["x", 2],
        ["y", 1],
      ],
    );
  });

  it("keeps only what occurs once with exactly_once, and #CALC! when nothing does", () => {
    assert.deepEqual(spilled("=UNIQUE(A1:A7,FALSE,TRUE)", [NUMBERS]), [[2], [3], [5], [4], [0]]);
    assert.deepEqual(spilled("=UNIQUE(A1:A2,FALSE,TRUE)", [[1, 1]]), [["#CALC!"]]);
  });

  it("compares columns with by_col", () => {
    assert.deepEqual(spilled("=UNIQUE(A1:C1,TRUE)", [[1], [2], [1]]), [[1, 2]]);
  });
});

describe("SEQUENCE and TRANSPOSE", () => {
  it("SEQUENCE fills rows first from start, step apart; a zero size is #CALC!, a negative one #VALUE!", () => {
    assert.deepEqual(spilled("=SEQUENCE(2,3,0,5)", []), [
      [0, 5, 10],
      [15, 20, 25],
    ]);
    assert.deepEqual(spilled("=SEQUENCE(3)", []), [[1], [2], [3]]);
    assert.deepEqual(spilled("=SEQUENCE(0)", []), [["#CALC!"]]);
    assert.deepEqual(spilled("=SEQUENCE(-1)", []), [["#VALUE!"]]);
  });

  it("TRANSPOSE turns rows into columns", () => {
    // A1:B2 holds the rows [a, 1] and [b, 2].
    assert.deepEqual(
      spilled("=TRANSPOSE(A1:B2)", [
        ["a", "b"],
        [1, 2],
      ]),
      [
        ["a", "b"],
        [1, 2],
      ],
    );
  });
});

describe("CHOOSECOLS, CHOOSEROWS, HSTACK, VSTACK, TAKE and DROP", () => {
  const table = [
    ["a", "b", "c"],
    [1, 2, 3],
  ];

  it("choose rows and columns, a negative one counting from the end; 0 or past the end is #VALUE!", () => {
    assert.deepEqual(spilled("=CHOOSECOLS(A1:B3,-1,1)", table), [
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
    assert.deepEqual(spilled("=CHOOSEROWS(A1:B3,3,1)", table), [
      ["c", 3],
      ["a", 1],
    ]);
    assert.deepEqual(spilled("=CHOOSECOLS(A1:B3,3)", table), [["#VALUE!"]]);
    assert.deepEqual(spilled("=CHOOSEROWS(A1:B3,0)", table), [["#VALUE!"]]);
  });

  it("stack side by side or one under another, the short side filled with #N/A", () => {
    assert.deepEqual(spilled("=HSTACK(A1:A2,B1:B3)", table), [
      ["a", 1],
      ["b", 2],
      ["#N/A", 3],
    ]);
    assert.deepEqual(spilled("=VSTACK(A1:B1,A2:A3)", table), [
      ["a", 1],
      ["b", "#N/A"],
      ["c", "#N/A"],
    ]);
  });

  it("take and drop from either end; nothing left is #CALC!", () => {
    assert.deepEqual(spilled("=TAKE(A1:B3,-2)", table), [
      ["b", 2],
      ["c", 3],
    ]);
    assert.deepEqual(spilled("=TAKE(A1:B3,9,-1)", table), [[1], [2], [3]]);
    assert.deepEqual(spilled("=DROP(A1:B3,1,1)", table), [[2], [3]]);
    assert.deepEqual(spilled("=DROP(A1:B3,-1)", table), [
      ["a", 1],
      ["b", 2],
    ]);
    assert.deepEqual(spilled("=TAKE(A1:B3,0)", table), [["#CALC!"]]);
    assert.deepEqual(spilled("=DROP(A1:B3,3)", table), [["#CALC!"]]);
  });
});

describe("XMATCH", () => {
  it("finds a position as XLOOKUP does, from either end and with the next smaller or larger", () => {
    const values = [[2, 1, 3, 1, 5]];
    assert.deepEqual(spilled("=XMATCH(1,A1:A5)", values), [[2]]);
    assert.deepEqual(spilled("=XMATCH(1,A1:A5,0,-1)", values), [[4]]);
    assert.deepEqual(spilled("=XMATCH(2.5,A1:A5,1)", values), [[3]]);
    assert.deepEqual(spilled("=XMATCH(2.5,A1:A5,-1)", values), [[1]]);
    assert.deepEqual(spilled("=XMATCH(9,A1:A5)", values), [["#N/A"]]);
    assert.deepEqual(spilled("=XMATCH(1,A1:A5,3)", values), [["#VALUE!"]]);
  });

  it("searches a sorted list from the first for the binary modes 2 and -2, as XLOOKUP does", () => {
    const ascending = [[1, 2, 2, 3]];
    const descending = [[3, 2, 2, 1]];
    assert.deepEqual(spilled("=XMATCH(2,A1:A4,0,2)", ascending), [[2]]);
    assert.deepEqual(spilled("=XMATCH(2,A1:A4,0,-2)", descending), [[2]]);
    assert.deepEqual(spilled("=XMATCH(2.5,A1:A4,1,2)", ascending), [[4]]);
    assert.deepEqual(
      spilled('=XLOOKUP(2,A1:A4,B1:B4,"none",0,2)', [
        [1, 2, 2, 3],
        ["a", "b", "c", "d"],
      ]),
      [["b"]],
    );
  });
});

describe("the functions together", () => {
  it("read each other's tables and are read by aggregates and lookups", () => {
    assert.deepEqual(spilled("=SORT(UNIQUE(A1:A7),1,-1)", [NUMBERS]), [[5], [4], [3], [2], [1], [0]]);
    assert.deepEqual(spilled("=SUM(TAKE(SEQUENCE(10),3))", []), [[6]]);
    assert.deepEqual(spilled("=ROWS(UNIQUE(A1:A7))", [NUMBERS]), [[6]]);
    assert.deepEqual(spilled("=XMATCH(4,SORT(A1:A7))", [NUMBERS]), [[6]]);
  });

  it("an error where a number is needed answers that error; an error where a table is read is a cell", () => {
    assert.deepEqual(spilled("=SORT(A1:A3,1/0)", [[1, 2, 3]]), [["#DIV/0!"]]);
    assert.deepEqual(spilled("=TAKE(A1:A3,1/0)", [[1, 2, 3]]), [["#DIV/0!"]]);
    assert.deepEqual(spilled("=HSTACK(B1,A1:A2)", [[1, 2], ["=1/0"]]), [
      ["#DIV/0!", 1],
      ["#N/A", 2],
    ]);
  });
});

const baseSeed = Number(process.env.ARRAY_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 40;

const randomTable = (random: Random): CellValue[][] => {
  const [height, width] = [1 + Math.floor(random() * 8), 1 + Math.floor(random() * 3)];
  return Array.from({ length: width }, () => Array.from({ length: height }, () => pick(random, [1, 2, 3, 7, "x", "X", "y", true, false, 0])));
};
const columnLetter = (index: number): string => String.fromCharCode("A".charCodeAt(0) + index);
const rangeOf = (columns: CellValue[][]): string => `A1:${columnLetter(columns.length - 1)}${columns[0]?.length ?? 1}`;
const rowsOf = (columns: CellValue[][]): CellValue[][] =>
  Array.from({ length: columns[0]?.length ?? 0 }, (_, row) => columns.map((column) => column[row] ?? ""));
const sortKey = (row: CellValue[]): string => JSON.stringify(row.map((cell) => (typeof cell === "string" ? cell.toLowerCase() : cell)));

describe(`properties over generated tables (seed ${baseSeed})`, () => {
  it("SORT keeps the rows and orders the key; UNIQUE leaves no two the same and loses none", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const columns = randomTable(random);
      const range = rangeOf(columns);
      const label = `seed ${baseSeed}: ${JSON.stringify(columns)}`;
      const sorted = spilled(`=SORT(${range})`, columns);
      assert.deepEqual(sorted.map(sortKey).sort(), rowsOf(columns).map(sortKey).sort(), label);
      const unique = spilled(`=UNIQUE(${range})`, columns);
      assert.equal(new Set(unique.map(sortKey)).size, unique.length, label);
      assert.deepEqual(new Set(unique.map(sortKey)), new Set(rowsOf(columns).map(sortKey)), label);
    });
  });

  it("TAKE then DROP of the same count puts the table back together; TRANSPOSE twice is the table", () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const columns = randomTable(random);
      const range = rangeOf(columns);
      const height = columns[0]?.length ?? 1;
      const count = 1 + Math.floor(random() * height);
      const label = `seed ${baseSeed}: ${JSON.stringify(columns)}, ${count}`;
      const whole = rowsOf(columns);
      const joined =
        count === height ? spilled(`=TAKE(${range},${count})`, columns) : spilled(`=VSTACK(TAKE(${range},${count}),DROP(${range},${count}))`, columns);
      assert.deepEqual(joined, whole, label);
      assert.deepEqual(spilled(`=TRANSPOSE(TRANSPOSE(${range}))`, columns), whole, label);
    });
  });
});
