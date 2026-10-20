// GROUPBY and PIVOTBY: grouping, the function argument, headers, totals, sorting and filtering, and
// properties against SUMIF and SUMIFS. Generated cases print their seed; rerun one with GROUP_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type CellValue } from "../../src/engine/index.ts";
import { groupsOf, sortedRows } from "../../src/engine/functions/group-by-math.ts";
import { seededRandom } from "./seededRandom.ts";

const SALES: CellValue[][] = [
  ["Region", "Rep", "Sales"],
  ["East", "Ann", 10],
  ["West", "Bob", 20],
  ["east", "Cy", 5],
  ["North", "Ann", 7],
  ["West", "Ann", 1],
];

/** What `formula`, written a column beside `rows`, spills. */
function answer(formula: string, rows: CellValue[][] = SALES): CellValue[][] {
  const width = rows[0]?.length ?? 0;
  const data = rows.map((row, r) => [...row, "", r === 0 ? formula : ""].map((v) => ({ v })));
  const [sheet] = new SpreadsheetEngine().calculateWorkbook([{ name: "S", data }]);
  return (sheet?.data ?? []).map((row) => row.slice(width + 1)).filter((row) => row.some((cell) => cell !== ""));
}

describe("GROUPBY", () => {
  it("aggregates each group, text keys without regard to case, sorted, with a Total row", () => {
    assert.deepEqual(answer("=GROUPBY(A2:A6,C2:C6,SUM)"), [
      ["East", 15],
      ["North", 7],
      ["West", 21],
      ["Total", 43],
    ]);
  });

  it("finds headers when the first value is text and the second a number, and shows them", () => {
    assert.deepEqual(answer("=GROUPBY(A1:A6,C1:C6,SUM)")[0], ["Region", "Sales"]);
    assert.deepEqual(answer("=GROUPBY(A1:A6,C1:C6,SUM,1)")[0], ["East", 15]);
    assert.deepEqual(answer("=GROUPBY(A2:A6,C2:C6,SUM,2)")[0], ["Row Field 1", "Value 1"]);
    assert.deepEqual(answer("=GROUPBY(A2:A6,C2:C6,SUM,5)"), [["#VALUE!"]]);
  });

  it("takes a LAMBDA of one parameter, given each group's values, and refuses anything else as the function", () => {
    assert.deepEqual(answer("=GROUPBY(A2:A6,C2:C6,LAMBDA(v,MAX(v)-MIN(v)))"), [
      ["East", 5],
      ["North", 0],
      ["West", 19],
      ["Total", 19],
    ]);
    assert.deepEqual(answer("=GROUPBY(A2:A6,C2:C6,NOPE)"), [["#VALUE!"]]);
    assert.deepEqual(answer("=GROUPBY(A2:A6,C2:C6,LAMBDA(a,b,a))"), [["#VALUE!"]]);
  });

  it("totals as asked: none, a grand total, subtotals for two key columns, at the top when negative", () => {
    assert.equal(answer("=GROUPBY(A2:A6,C2:C6,SUM,0,0)").length, 3);
    assert.equal(answer("=GROUPBY(A2:A6,C2:C6,SUM,0,2)").length, 4, "one key column has no subtotals");
    assert.deepEqual(answer("=GROUPBY(A2:A6,C2:C6,SUM,0,-1)")[0], ["Total", 43]);
    assert.deepEqual(answer("=GROUPBY(A2:B6,C2:C6,SUM)"), [
      ["East", "Ann", 10],
      ["east", "Cy", 5],
      ["East", "", 15],
      ["North", "Ann", 7],
      ["North", "", 7],
      ["West", "Ann", 1],
      ["West", "Bob", 20],
      ["West", "", 21],
      ["Total", "", 43],
    ]);
    assert.deepEqual(answer("=GROUPBY(A2:B6,C2:C6,SUM,0,-2)").slice(0, 2), [
      ["Total", "", 43],
      ["East", "", 15],
    ]);
  });

  it("sorts by a column of the answer, descending when negative, and keeps the rows filter_array keeps", () => {
    assert.deepEqual(
      answer("=GROUPBY(A2:A6,C2:C6,SUM,0,1,-2)").map((row) => row[0]),
      ["West", "East", "North", "Total"],
    );
    assert.deepEqual(answer("=GROUPBY(A2:A6,C2:C6,SUM,0,1,3)"), [["#VALUE!"]]);
    assert.deepEqual(answer("=GROUPBY(A2:A6,C2:C6,COUNT,0,1,1,C2:C6>5)"), [
      ["East", 1],
      ["North", 1],
      ["West", 1],
      ["Total", 3],
    ]);
    assert.deepEqual(answer("=GROUPBY(A2:A6,C2:C6,SUM,0,1,1,C2:C4>5)"), [["#VALUE!"]]);
  });

  it("is #VALUE! for values of another height and for field_relationship, which is not supported", () => {
    assert.deepEqual(answer("=GROUPBY(A2:A6,C2:C5,SUM)"), [["#VALUE!"]]);
    assert.deepEqual(answer("=GROUPBY(A2:A6,C2:C6,SUM,0,1,1,,1)"), [["#VALUE!"]]);
  });
});

describe("PIVOTBY", () => {
  it("lays column keys across, row keys down, blank where no row has both, with Total rows and columns", () => {
    assert.deepEqual(answer("=PIVOTBY(A2:A6,B2:B6,C2:C6,SUM)"), [
      ["", "Ann", "Bob", "Cy", "Total"],
      ["East", 10, "", 5, 15],
      ["North", 7, "", "", 7],
      ["West", 1, 20, "", 21],
      ["Total", 18, 20, 5, 43],
    ]);
  });

  it("drops the totals at 0, puts them first when negative, reads headers, and sorts descending when asked", () => {
    assert.deepEqual(answer("=PIVOTBY(A2:A6,B2:B6,C2:C6,SUM,0,0,1,0)"), [
      ["", "Ann", "Bob", "Cy"],
      ["East", 10, "", 5],
      ["North", 7, "", ""],
      ["West", 1, 20, ""],
    ]);
    assert.deepEqual(answer("=PIVOTBY(A2:A6,B2:B6,C2:C6,SUM,0,-1,-1,-1,-1)")[0], ["", "Total", "Cy", "Bob", "Ann"]);
    assert.deepEqual(answer("=PIVOTBY(A2:A6,B2:B6,C2:C6,SUM,0,-1,-1,-1)")[1]?.[0], "Total");
    assert.deepEqual(answer("=PIVOTBY(A1:A6,B1:B6,C1:C6,COUNT)").at(-1), ["Total", 3, 1, 1, 5]);
  });

  it("is #VALUE! for more than one values column, and for relative_to", () => {
    assert.deepEqual(answer("=PIVOTBY(A2:A6,B2:B6,B2:C6,SUM)"), [["#VALUE!"]]);
    assert.deepEqual(answer("=PIVOTBY(A2:A6,B2:B6,C2:C6,SUM,0,1,1,1,1,,1)"), [["#VALUE!"]]);
  });
});

describe("the rules", () => {
  it("groupsOf keeps first-appearance order and only the included rows", () => {
    assert.deepEqual(groupsOf([["b"], ["a"], ["B"]], [true, true, true]), [
      { key: ["b"], rows: [0, 2] },
      { key: ["a"], rows: [1] },
    ]);
    assert.deepEqual(groupsOf([["b"], ["a"]], [false, true]), [{ key: ["a"], rows: [1] }]);
  });

  it("sortedRows sorts by each index in turn, stably", () => {
    assert.deepEqual(
      sortedRows(
        [
          [2, "x"],
          [1, "y"],
          [2, "a"],
        ],
        [1, -2],
      ),
      [
        [1, "y"],
        [2, "x"],
        [2, "a"],
      ],
    );
  });
});

const baseSeed = Number(process.env.GROUP_SEED ?? Date.now() % 1_000_000);

describe(`properties over generated data (seed ${baseSeed})`, () => {
  it("GROUPBY with SUM is SUMIF for each key, and its Total is SUM; PIVOTBY's cells are SUMIFS", () => {
    const random = seededRandom(baseSeed);
    const keys = ["a", "b", "c"];
    const columns = ["x", "y"];
    Array.from({ length: 10 }).forEach(() => {
      const height = 2 + Math.floor(random() * 10);
      const rows: CellValue[][] = Array.from({ length: height }, () => [
        keys[Math.floor(random() * 3)] ?? "a",
        columns[Math.floor(random() * 2)] ?? "x",
        Math.round(random() * 50),
      ]);
      const label = `seed ${baseSeed}: ${JSON.stringify(rows)}`;
      const sumOf = (filter: (row: CellValue[]) => boolean): number => rows.filter(filter).reduce((sum, row) => sum + Number(row[2]), 0);
      const grouped = answer(`=GROUPBY(A1:A${height},C1:C${height},SUM,0)`, rows);
      grouped.slice(0, -1).forEach(([key, total]) =>
        assert.equal(
          total,
          sumOf((row) => row[0] === key),
          label,
        ),
      );
      assert.deepEqual(grouped.at(-1), ["Total", sumOf(() => true)], label);
      const pivot = answer(`=PIVOTBY(A1:A${height},B1:B${height},C1:C${height},SUM,0)`, rows);
      const header = pivot[0] ?? [];
      pivot.slice(1, -1).forEach((row) =>
        header.slice(1, -1).forEach((column, index) => {
          const matching = rows.filter((data) => data[0] === row[0] && data[1] === column);
          assert.equal(row[index + 1], matching.length === 0 ? "" : sumOf((data) => data[0] === row[0] && data[1] === column), label);
        }),
      );
    });
  });
});
