// Sheets that read each other (#130): a workbook split across two sheets must calculate exactly as it
// does on one. Data → Settings → Data is the everyday layout of an analysis, and only a CELL that
// depends on itself is a cycle. Generated: SHEETS_SEED=<seed> replays a run.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateSheet, type SheetData } from "../../src/engine/index.ts";
import { indexToColumn } from "../../src/engine/parser.ts";
import { functionRegistry, type FunctionDefinition } from "../../src/engine/registry.ts";
import { lcgRandom } from "./seededRandom.ts";

const ROUNDS = 60;
const MAX_ROWS = 8;
const MAX_COLUMNS = 6;
const SEED = Number(process.env.SHEETS_SEED ?? Date.now() % 1_000_000);

const random = lcgRandom(SEED);
const below = (n: number): number => Math.floor(random() * n);

interface Grid {
  rows: number;
  columns: number;
  /** A cell's content, its references written as {r,c} placeholders to be rendered per layout. */
  cells: string[][];
}

/** A reference to an EARLIER cell (in row-major order), so the grid has no cycle. */
const earlierRef = (row: number, col: number, columns: number): string => {
  const index = below(row * columns + col);
  return `{${Math.floor(index / columns)},${index % columns}}`;
};

/** A random grid: numbers, and formulas over earlier cells — arithmetic, SUM of a column above, IF. */
function generateGrid(): Grid {
  const rows = 2 + below(MAX_ROWS - 1);
  const columns = 2 + below(MAX_COLUMNS - 1);
  const cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_cell, col) => {
      if ((row === 0 && col === 0) || random() < 0.35) return String(below(20) - 5);
      const a = earlierRef(row, col, columns);
      const b = earlierRef(row, col, columns);
      const pick = below(4);
      if (pick === 0) return `=${a}+${b}`;
      if (pick === 1) return `=${a}*2-${b}`;
      if (pick === 2 && row > 0) return `=SUM({0,${col}}:{${row - 1},${col}})`;
      return `=IF(${a}>${b},${a},${b})`;
    }),
  );
  return { rows, columns, cells };
}

/** Render the grid on one sheet. */
const oneSheet = (grid: Grid): SheetData => ({
  name: "One",
  data: grid.cells.map((row) =>
    row.map((cell) => ({ v: cell.replace(/\{(\d+),(\d+)\}/g, (_, r: string, c: string) => `${indexToColumn(Number(c))}${Number(r) + 1}`) })),
  ),
});

const sheetOf = (col: number): string => (col % 2 === 0 ? "A" : "B");

// A range names its sheet once: `B!A1:A3`. Ranges here are one column, so one sheet.
const local = (r: number, c: number): string => `${indexToColumn(Math.floor(c / 2))}${r + 1}`;

const place = (r: number, c: number): string => `${sheetOf(c)}!${indexToColumn(Math.floor(c / 2))}${r + 1}`;

const render = (cell: string): string =>
  cell
    .replace(
      /\{(\d+),(\d+)\}:\{(\d+),(\d+)\}/g,
      (_, r1: string, c: string, r2: string) => `${sheetOf(Number(c))}!${local(Number(r1), Number(c))}:${local(Number(r2), Number(c))}`,
    )
    .replace(/\{(\d+),(\d+)\}/g, (_, r: string, c: string) => place(Number(r), Number(c)));

/** Render it across sheets A and B, alternating columns, every reference to its cell's new home. */
function twoSheets(grid: Grid): SheetData[] {
  return ["A", "B"].map((name) => ({
    name,
    data: grid.cells.map((row) => row.flatMap((cell, col) => (sheetOf(col) === name ? [{ v: render(cell) }] : []))),
  }));
}

describe(`sheets that read each other (SHEETS_SEED=${SEED})`, () => {
  it("calculate as the same workbook does on one sheet", () => {
    const failures = Array.from({ length: ROUNDS }, () => {
      const grid = generateGrid();
      const one = calculateSheet(oneSheet(grid)).data;
      const sheets = twoSheets(grid);
      const [a, b] = sheets.map((sheet) => calculateSheet(sheet, sheets).data);
      return grid.cells.flatMap((row, r) =>
        row.flatMap((_, c) => {
          const split = (c % 2 === 0 ? a : b)?.[r]?.[Math.floor(c / 2)];
          return split === one[r]?.[c] ? [] : [`cell {${r},${c}} one-sheet=${String(one[r]?.[c])} split=${String(split)} in ${JSON.stringify(grid.cells)}`];
        }),
      );
    }).flat();
    assert.deepEqual(failures.slice(0, 3), [], `seed ${SEED}: ${failures.length} cells differ`);
  });

  // Each sheet used to calculate the other WHOLE, again from inside each other, so a 30-row Data
  // sheet beside a Settings sheet that sums it ran each formula thousands of times — the stress test
  // workbooks hit the time limit for workbook functions that way.
  it("evaluates each formula cell once even when the sheets read each other", () => {
    const counter = { calls: 0 };
    const probe: FunctionDefinition = {
      name: "PROBE",
      minArgs: 0,
      maxArgs: 0,
      handler: () => {
        counter.calls += 1;
        return 1;
      },
    };
    const rows = 30;
    const data: SheetData = { name: "Data", data: Array.from({ length: rows }, (_, row) => [{ v: row + 1 }, { v: `=PROBE()*Settings!A1+A${row + 1}` }]) };
    const settings: SheetData = { name: "Settings", data: [[{ v: `=MAX(Data!A1:A${rows})` }], [{ v: `=SUM(Data!B1:B${rows})` }]] };
    const result = functionRegistry.withOverlay(new Map([["PROBE", probe]]), () => calculateSheet(settings, [data, settings]));
    assert.equal(counter.calls, rows);
    // Each B is rows + its own row number (Settings!A1 is the largest A, which is rows).
    assert.deepEqual(result.data, [[rows], [rows * rows + (rows * (rows + 1)) / 2]]);
  });

  it("lists every formula of the sheet, also one another sheet calculated first", () => {
    const data: SheetData = { name: "Data", data: [[{ v: "=Settings!A1+1" }, { v: "=A2*2", f: "0.00" }], [{ v: 3 }]] };
    const settings: SheetData = { name: "Settings", data: [[{ v: "=Data!B1" }]] };
    const result = calculateSheet(data, [data, settings]);
    assert.deepEqual(
      result.formulas.map((info) => info.formula),
      ["=Settings!A1+1", "=A2*2"],
    );
  });

  it("does not report a cycle where no cell depends on itself", () => {
    const data: SheetData = { name: "Data", data: [[{ v: 10 }, { v: "=Settings!A1*2" }]] };
    const settings: SheetData = { name: "Settings", data: [[{ v: "=Data!A1+1" }]] };
    const result = calculateSheet(data, [data, settings]);
    assert.deepEqual(result.data[0], [10, 22]);
    assert.deepEqual(result.errors, []);
  });
});
