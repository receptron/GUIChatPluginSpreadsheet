// The aggregate and criteria functions against references written from Excel's
// rules, over generated columns that mix numbers, blanks, text and logicals.
// Hand-picked cases missed that a blank read as 0 moved COUNTIF, AVERAGEIF and
// CORREL; generated mixes find that kind of thing. The seed is printed, and
// STATISTICS_SEED=<seed> replays a run.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import type { StoredCellValue } from "../../src/engine/types.ts";

const ROUNDS = 150;
const MAX_ROWS = 12;
const RELATIVE_TOLERANCE = 1e-9;
const SEED = Number(process.env.STATISTICS_SEED ?? Date.now() % 1_000_000);

const random = (() => {
  let state = SEED;
  return (): number => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
})();
const pick = <T>(items: [T, ...T[]]): T => items[Math.floor(random() * items.length)] ?? items[0];

const generateCell = (): StoredCellValue => {
  const roll = random();
  if (roll < 0.1) return "";
  if (roll < 0.15) return "x";
  if (roll < 0.18) return pick([true, false]);
  if (roll < 0.5) return Math.floor(random() * 20) - 5;
  if (roll < 0.6) return pick([0, 1, 2, 2, 3]);
  return Math.round((random() * 200 - 50) * 100) / 100;
};

const ERROR = "error";
type Expected = number | typeof ERROR;
type Column = StoredCellValue[];

const numbersIn = (column: Column): number[] => column.filter((value): value is number => typeof value === "number");
const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);
const mean = (values: number[]): Expected => (values.length > 0 ? sum(values) / values.length : ERROR);
const squaredDeviations = (values: number[]): number => {
  const center = sum(values) / values.length;
  return sum(values.map((value) => (value - center) ** 2));
};
const sorted = (values: number[]): number[] => values.toSorted((a, b) => a - b);
const percentile = (values: number[], k: number): Expected => {
  if (values.length === 0) return ERROR;
  const ordered = sorted(values);
  const position = (ordered.length - 1) * k;
  const low = Math.floor(position);
  const lowValue = ordered[low] ?? 0;
  return lowValue + (position - low) * ((ordered[low + 1] ?? lowValue) - lowValue);
};
const pairsOf = (ys: Column, xs: Column): [number, number][] =>
  ys.flatMap((y, row) => {
    const x = xs[row];
    const pair: [number, number][] = typeof y === "number" && typeof x === "number" ? [[y, x]] : [];
    return pair;
  });
/** The least-squares line through the complete pairs. Slope and intercept need x to vary;
 *  the correlation needs both sides to vary (a flat y has slope 0 but no correlation). */
const regression = (ys: Column, xs: Column): { slope: number; intercept: number; r: Expected } | typeof ERROR => {
  const pairs = pairsOf(ys, xs);
  if (pairs.length < 2) return ERROR;
  const y = pairs.map(([value]) => value);
  const x = pairs.map(([, value]) => value);
  const sxx = squaredDeviations(x);
  const syy = squaredDeviations(y);
  if (sxx === 0) return ERROR;
  const yCenter = sum(y) / y.length;
  const xCenter = sum(x) / x.length;
  const sxy = sum(pairs.map(([yv, xv]) => (yv - yCenter) * (xv - xCenter)));
  return { slope: sxy / sxx, intercept: yCenter - (sxy / sxx) * xCenter, r: syy === 0 ? ERROR : sxy / Math.sqrt(sxx * syy) };
};
const fromRegression = (ys: Column, xs: Column, read: (fit: { slope: number; intercept: number; r: Expected }) => Expected): Expected => {
  const fit = regression(ys, xs);
  return fit === ERROR ? ERROR : read(fit);
};

/** The number at `row`, as a one-item list, or nothing when the cell holds no number. */
const numberAt = (column: Column, row: number): number[] => {
  const value = column[row];
  return typeof value === "number" ? [value] : [];
};

type Ordering = "<" | ">" | "<=" | ">=";
const orderingHolds = (value: StoredCellValue, ordering: Ordering, threshold: number): boolean => {
  if (typeof value !== "number") return false;
  return { "<": value < threshold, ">": value > threshold, "<=": value <= threshold, ">=": value >= threshold }[ordering];
};

interface Case {
  formula: string;
  expected: (a: Column, b: Column, c: Column) => Expected;
}

const ORDERINGS: Ordering[] = ["<", ">", "<=", ">="];
const CASES: Case[] = [
  { formula: "SUM(A1:A{n})", expected: (a) => sum(numbersIn(a)) },
  { formula: "AVERAGE(A1:A{n})", expected: (a) => mean(numbersIn(a)) },
  { formula: "COUNT(A1:A{n})", expected: (a) => numbersIn(a).length },
  { formula: "COUNTA(A1:A{n})", expected: (a) => a.filter((value) => value !== "").length },
  { formula: "MEDIAN(A1:A{n})", expected: (a) => percentile(numbersIn(a), 0.5) },
  { formula: "STDEV(A1:A{n})", expected: (a) => (numbersIn(a).length > 1 ? Math.sqrt(squaredDeviations(numbersIn(a)) / (numbersIn(a).length - 1)) : ERROR) },
  { formula: "VARP(A1:A{n})", expected: (a) => (numbersIn(a).length > 0 ? squaredDeviations(numbersIn(a)) / numbersIn(a).length : ERROR) },
  { formula: "PERCENTILE(A1:A{n},0.3)", expected: (a) => percentile(numbersIn(a), 0.3) },
  { formula: "QUARTILE(A1:A{n},3)", expected: (a) => percentile(numbersIn(a), 0.75) },
  { formula: "LARGE(A1:A{n},2)", expected: (a) => sorted(numbersIn(a)).toReversed()[1] ?? ERROR },
  { formula: "SMALL(A1:A{n},2)", expected: (a) => sorted(numbersIn(a))[1] ?? ERROR },
  { formula: "SLOPE(B1:B{n},A1:A{n})", expected: (a, b) => fromRegression(b, a, (fit) => fit.slope) },
  { formula: "INTERCEPT(B1:B{n},A1:A{n})", expected: (a, b) => fromRegression(b, a, (fit) => fit.intercept) },
  { formula: "CORREL(A1:A{n},B1:B{n})", expected: (a, b) => fromRegression(b, a, (fit) => fit.r) },
  { formula: "RSQ(B1:B{n},A1:A{n})", expected: (a, b) => fromRegression(b, a, (fit) => (fit.r === ERROR ? ERROR : fit.r ** 2)) },
  ...ORDERINGS.flatMap((ordering): Case[] => [
    { formula: `COUNTIF(A1:A{n},"${ordering}2")`, expected: (a) => a.filter((value) => orderingHolds(value, ordering, 2)).length },
    {
      formula: `SUMIF(A1:A{n},"${ordering}2",B1:B{n})`,
      expected: (a, b) => sum(a.flatMap((value, row) => (orderingHolds(value, ordering, 2) ? numberAt(b, row) : []))),
    },
    {
      formula: `AVERAGEIF(A1:A{n},"${ordering}2",B1:B{n})`,
      expected: (a, b) => mean(a.flatMap((value, row) => (orderingHolds(value, ordering, 2) ? numberAt(b, row) : []))),
    },
  ]),
  { formula: 'COUNTIF(A1:A{n},"<>2")', expected: (a) => a.filter((value) => value !== 2).length },
  { formula: 'COUNTIF(A1:A{n},"")', expected: (a) => a.filter((value) => value === "").length },
  { formula: 'COUNTIFS(C1:C{n},"p",A1:A{n},">0")', expected: (a, _b, c) => a.filter((value, row) => c[row] === "p" && orderingHolds(value, ">", 0)).length },
  {
    formula: 'AVERAGEIFS(B1:B{n},C1:C{n},"q",A1:A{n},"<=3")',
    expected: (a, b, c) =>
      mean(b.flatMap((value, row) => (c[row] === "q" && orderingHolds(a[row] ?? "", "<=", 3) && typeof value === "number" ? [value] : []))),
  },
];

const agrees = (got: unknown, expected: Expected): boolean => {
  if (expected === ERROR) return typeof got === "string" && got.startsWith("#");
  return typeof got === "number" && Math.abs(got - expected) <= RELATIVE_TOLERANCE * Math.max(1, Math.abs(got), Math.abs(expected));
};

/** One generated sheet: columns A–C, and every case's formula in column E. */
const runRound = (): string[] => {
  const rows = 1 + Math.floor(random() * MAX_ROWS);
  const a = Array.from({ length: rows }, generateCell);
  const b = Array.from({ length: rows }, generateCell);
  const c = Array.from({ length: rows }, () => pick<StoredCellValue>(["p", "q", "r", ""]));
  const formulaOf = (index: number): string => (CASES[index]?.formula ?? "").replaceAll("{n}", String(rows));
  const data: SheetData["data"] = Array.from({ length: Math.max(rows, CASES.length) }, (_, row) => [
    { v: a[row] ?? "" },
    { v: b[row] ?? "" },
    { v: c[row] ?? "" },
    { v: "" },
    { v: row < CASES.length ? `=${formulaOf(row)}` : "" },
  ]);
  const calculated = new SpreadsheetEngine().calculate({ name: "S", data }).data;
  return CASES.flatMap((testCase, row) => {
    const got = calculated[row]?.[4];
    const expected = testCase.expected(a, b, c);
    return agrees(got, expected)
      ? []
      : [`${formulaOf(row)} gave ${JSON.stringify(got)}, expected ${expected} for A=${JSON.stringify(a)} B=${JSON.stringify(b)} C=${JSON.stringify(c)}`];
  });
};

describe(`statistics over generated columns (STATISTICS_SEED=${SEED})`, () => {
  it("agrees with the Excel-rule references", () => {
    const failures = Array.from({ length: ROUNDS }, runRound).flat();
    assert.deepEqual(failures.slice(0, 5), [], `seed ${SEED}: ${failures.length} disagreements`);
  });
});
