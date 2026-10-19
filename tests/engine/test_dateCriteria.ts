// A criteria comparing against a date (`">=1/2/2020"`) compares the date's
// serial. parseFloat read only the `1` of `1/2/2020`, so every date in the range
// was "greater" and COUNTIF counted them all. The generated cases count with a
// serial computed here from Date.UTC, independent of the engine's date parser;
// a failure prints the seed, rerun one with DATE_CRITERIA_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCriteria } from "../../src/engine/registry.ts";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { cellAt } from "./cellAccess.ts";
import { seededRandom, type Random } from "./seededRandom.ts";

const MS_PER_DAY = 86_400_000;
const SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30);
const serialOf = (year: number, month: number, day: number): number => (Date.UTC(year, month - 1, day) - SERIAL_EPOCH_MS) / MS_PER_DAY;

const JAN_1_2020 = serialOf(2020, 1, 1);
const JAN_2_2020 = serialOf(2020, 1, 2);
const FEB_1_2020 = serialOf(2020, 2, 1);

describe("parseCriteria — a date after a comparison operator", () => {
  it("compares the date's serial, not the leading number", () => {
    const onOrAfter = parseCriteria(">=1/2/2020");
    assert.equal(onOrAfter(JAN_1_2020), false);
    assert.equal(onOrAfter(JAN_2_2020), true);
    assert.equal(onOrAfter(1), false, "parseFloat read 1/2/2020 as 1");
  });

  it("applies every ordering operator", () => {
    assert.equal(parseCriteria(">1/1/2020")(JAN_2_2020), true);
    assert.equal(parseCriteria(">1/2/2020")(JAN_2_2020), false);
    assert.equal(parseCriteria("<1/2/2020")(JAN_1_2020), true);
    assert.equal(parseCriteria("<1/2/2020")(JAN_2_2020), false);
    assert.equal(parseCriteria("<=1/2/2020")(JAN_2_2020), true);
    assert.equal(parseCriteria("<=1/2/2020")(FEB_1_2020), false);
  });

  it("matches the date itself with = and everything else with <>", () => {
    assert.equal(parseCriteria("=1/2/2020")(JAN_2_2020), true);
    assert.equal(parseCriteria("=1/2/2020")(1), false);
    assert.equal(parseCriteria("<>1/2/2020")(JAN_2_2020), false);
    assert.equal(parseCriteria("<>1/2/2020")(1), true);
    assert.equal(parseCriteria("<>1/2/2020")("text"), true);
  });

  it("reads the date forms the sheet reads", () => {
    ["1/2/2020", "2020-01-02", "2020/01/02", "Jan 2, 2020", "January 2 2020", "2-Jan-2020", "2 Jan 2020"].forEach((written) => {
      assert.equal(parseCriteria(`>=${written}`)(JAN_2_2020), true, written);
      assert.equal(parseCriteria(`>=${written}`)(JAN_1_2020), false, written);
      assert.equal(parseCriteria(`=${written}`)(JAN_2_2020), true, written);
    });
  });

  it("reads an ambiguous date day-first when asked to", () => {
    assert.equal(parseCriteria("=01/02/2020")(JAN_2_2020), true, "month-first by default");
    assert.equal(parseCriteria("=01/02/2020", true)(FEB_1_2020), true, "day-first");
    assert.equal(parseCriteria("=01/02/2020", true)(JAN_2_2020), false);
    assert.equal(parseCriteria("01/02/2020", true)(FEB_1_2020), true, "a bare date, day-first");
    assert.equal(parseCriteria("01/02/2020")(JAN_2_2020), true, "a bare date, month-first");
  });

  it("still reads a plain number as a number", () => {
    assert.equal(parseCriteria(">=10")(10), true);
    assert.equal(parseCriteria(">=10")(9), false);
    assert.equal(parseCriteria(">-1000000")(-5), true);
    assert.equal(parseCriteria("<2.5")(2.4), true);
    assert.equal(parseCriteria("=1e3")(1000), true);
    assert.equal(parseCriteria("2")(2), true);
  });

  it("still compares a criteria that is neither a number nor a date as text", () => {
    assert.equal(parseCriteria("=1/2")("1/2"), true);
    assert.equal(parseCriteria("<>abc")("abc"), false);
    assert.equal(parseCriteria("=2020-13-01")("2020-13-01"), true, "not a real date, so text");
  });
});

const calcIn = (rows: unknown[][], options: { preferDDMMYYYY?: boolean } = {}): unknown[][] => {
  const data = new SpreadsheetEngine(options).calculate({ name: "S", data: rows.map((row) => row.map((v) => ({ v }))) } satisfies SheetData).data;
  return rows.map((row, rowIndex) => row.map((_, colIndex) => cellAt(data, rowIndex, colIndex)));
};

const firstRowResults = (formulas: string[], options: { preferDDMMYYYY?: boolean } = {}): unknown[] => {
  const column = ["2020-01-01", 1, "2020-01-02"];
  const values = [10, 20, 30];
  const rows: unknown[][] = column.map((date, index) => [date, values[index]]);
  rows[0].push(...formulas);
  return calcIn(rows, options)[0].slice(2);
};

describe("conditional functions with a date criteria", () => {
  it("counts, sums and averages the dates on one side", () => {
    assert.deepEqual(
      firstRowResults([
        '=COUNTIF(A1:A3,">=1/2/2020")',
        '=SUMIF(A1:A3,">=1/2/2020",B1:B3)',
        '=AVERAGEIF(A1:A3,"<1/2/2020",B1:B3)',
        '=COUNTIFS(A1:A3,">=1/1/2020",A1:A3,"<1/2/2020")',
        '=SUMIFS(B1:B3,A1:A3,">1/1/2020")',
        '=AVERAGEIFS(B1:B3,A1:A3,"<>1/2/2020")',
      ]),
      [1, 30, 15, 1, 30, 15],
    );
  });

  it("matches a date with = rather than the number its month spells", () => {
    assert.deepEqual(firstRowResults(['=COUNTIF(A1:A3,"=1/2/2020")', '=SUMIF(A1:A3,"=1/2/2020",B1:B3)']), [1, 30]);
  });

  it("takes a criteria built with &", () => {
    assert.deepEqual(firstRowResults(['=COUNTIF(A1:A3,">="&"1/2/2020")', '=COUNTIF(A1:A3,">="&DATE(2020,1,2))']), [1, 1]);
  });

  it("reads the criteria the way the sheet reads its dates", () => {
    assert.deepEqual(firstRowResults(['=COUNTIF(A1:A3,">=02/01/2020")'], { preferDDMMYYYY: true }), [1]);
    assert.deepEqual(firstRowResults(['=COUNTIF(A1:A3,">=02/01/2020")']), [0], "month-first, so 1 Feb is after every date");
  });
});

const integerBelow = (random: Random, limit: number): number => Math.floor(random() * limit);

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const MONTH_ABBREVIATIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (value: number): string => String(value).padStart(2, "0");
const DATE_WRITERS: ((date: CalendarDate) => string)[] = [
  ({ year, month, day }) => `${month}/${day}/${year}`,
  ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`,
  ({ year, month, day }) => `${MONTH_ABBREVIATIONS[month - 1]} ${day}, ${year}`,
  ({ year, month, day }) => `${day}-${MONTH_ABBREVIATIONS[month - 1]}-${year}`,
];

const randomDate = (random: Random): CalendarDate => ({
  year: 2019 + integerBelow(random, 3),
  month: 1 + integerBelow(random, 12),
  day: 1 + integerBelow(random, 28),
});
const serialOfDate = ({ year, month, day }: CalendarDate): number => serialOf(year, month, day);

const COMPARE: Record<string, (value: number, threshold: number) => boolean> = {
  ">": (value, threshold) => value > threshold,
  ">=": (value, threshold) => value >= threshold,
  "<": (value, threshold) => value < threshold,
  "<=": (value, threshold) => value <= threshold,
  "=": (value, threshold) => value === threshold,
  "<>": (value, threshold) => value !== threshold,
};

const GENERATED_CASES = 150;
const CELLS_PER_CASE = 8;
const baseSeed = Number(process.env.DATE_CRITERIA_SEED ?? Date.now() % 1_000_000);

describe("COUNTIF with a generated date criteria", () => {
  it(`agrees with a count over Date.UTC serials (seed ${baseSeed})`, () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach((_, caseIndex) => {
      const dates = Array.from({ length: CELLS_PER_CASE }, () => randomDate(random));
      const threshold = randomDate(random);
      const operator = Object.keys(COMPARE)[integerBelow(random, Object.keys(COMPARE).length)];
      const written = DATE_WRITERS[integerBelow(random, DATE_WRITERS.length)](threshold);
      const rows: unknown[][] = dates.map((date) => [`${date.year}-${pad(date.month)}-${pad(date.day)}`]);
      rows[0].push(`=COUNTIF(A1:A${CELLS_PER_CASE},"${operator}${written}")`);
      const expected = dates.filter((date) => COMPARE[operator](serialOfDate(date), serialOfDate(threshold))).length;
      assert.equal(
        calcIn(rows)[0][1],
        expected,
        `seed ${baseSeed} case ${caseIndex}: "${operator}${written}" over ${JSON.stringify(rows.map((row) => row[0]))}`,
      );
    });
  });
});
