// AUTOCORREL, EMA and DECOMPOSE: against statsmodels and pandas themselves
// (tests/tools/generate_time_series_reference.py), against the argument rules, and against
// properties that hold for any series.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SpreadsheetEngine, type CellValue } from "../../src/engine/index.ts";

const RELATIVE_TOLERANCE = 1e-9;

interface ReferenceCase {
  fn: "AUTOCORREL" | "EMA" | "DECOMPOSE";
  values: number[];
  arg: number;
  model?: string;
  expected: number | (number | string)[] | (number | string)[][];
}

const isReferenceCase = (value: unknown): value is ReferenceCase => typeof value === "object" && value !== null && "fn" in value && "values" in value;
const parsed: unknown = JSON.parse(readFileSync(new URL("./fixtures/time-series-reference.json", import.meta.url), "utf8"));
const REFERENCE: ReferenceCase[] = Array.isArray(parsed) ? parsed.filter(isReferenceCase) : [];

/** What `formula` spills, written in C1 beside `values` in column A (or in row 3 beside a row of them). */
function answer(formula: (range: string) => string, values: CellValue[], asRow = false): CellValue[][] {
  const range = asRow ? `A1:${String.fromCharCode(64 + values.length)}1` : `A1:A${values.length}`;
  const rows = asRow ? [values, [], [formula(range)]] : values.map((value, index) => [value, "", index === 0 ? formula(range) : ""]);
  const data = rows.map((row) => row.map((v) => ({ v })));
  const [sheet] = new SpreadsheetEngine().calculateWorkbook([{ name: "S", data }]);
  const out = sheet?.data ?? [];
  return (asRow ? out.slice(2) : out.map((row) => row.slice(2))).filter((row) => row.some((cell) => cell !== ""));
}

const close = (actual: CellValue, expected: number | string, label: string): void => {
  if (typeof expected === "string") {
    assert.equal(actual, expected, label);
    return;
  }
  const error = Math.abs(Number(actual) - expected) / Math.max(Math.abs(expected), 1);
  assert.ok(typeof actual === "number" && error <= RELATIVE_TOLERANCE, `${label}: ${String(actual)} vs ${expected}`);
};

describe("against statsmodels and pandas", () => {
  REFERENCE.forEach((reference, index) => {
    it(`${reference.fn} case ${index}`, () => {
      const label = JSON.stringify(reference);
      if (reference.fn === "AUTOCORREL") {
        close(answer((range) => `=AUTOCORREL(${range},${reference.arg})`, reference.values)[0]?.[0] ?? "", Number(reference.expected), label);
      } else if (reference.fn === "EMA") {
        const expected = Array.isArray(reference.expected) ? reference.expected : [];
        answer((range) => `=EMA(${range},${reference.arg})`, reference.values).forEach(([value], row) => close(value ?? "", Number(expected[row]), label));
      } else {
        const expected = Array.isArray(reference.expected) ? reference.expected : [];
        const table = answer((range) => `=DECOMPOSE(${range},${reference.arg},"${reference.model ?? "additive"}")`, reference.values);
        assert.equal(table.length, expected.length, label);
        expected.forEach((row, r) => (Array.isArray(row) ? row : []).forEach((value, c) => close(table[r]?.[c] ?? "", value, `${label} [${r}][${c}]`)));
      }
    });
  });
});

describe("the argument rules", () => {
  const values = [3, 5, 4, 6, 8, 7];

  it("reads a series in a row, and answers a row of points for it", () => {
    assert.deepEqual(
      answer((range) => `=EMA(${range},1)`, values, true),
      [values],
    );
    assert.deepEqual(
      answer((range) => `=AUTOCORREL(${range},0)`, values, true),
      [[1]],
    );
    assert.equal(answer((range) => `=DECOMPOSE(${range},2)`, values, true).length, 3);
  });

  it("answers #VALUE! for a blank or text in the series, or a table of more than one row and column, and an error cell's error", () => {
    assert.deepEqual(
      answer((range) => `=AUTOCORREL(${range},1)`, [1, "", 3]),
      [["#VALUE!"]],
    );
    assert.deepEqual(
      answer((range) => `=EMA(${range},0.5)`, [1, "x", 3]),
      [["#VALUE!"]],
    );
    assert.deepEqual(
      answer((range) => `=AUTOCORREL(${range},1)`, [1, "=1/0", 3]),
      [["#DIV/0!"]],
    );
    const grid = [[{ v: 1 }, { v: 2 }], [{ v: 3 }, { v: 4 }], [{ v: "=EMA(A1:B2,0.5)" }]];
    assert.equal(new SpreadsheetEngine().calculate({ name: "S", data: grid }).data[2]?.[0], "#VALUE!");
  });

  it("answers #NUM! for a lag outside the series, an alpha outside (0, 1], a period below 2 or longer than half the series, and a multiplicative model over a value not above 0", () => {
    assert.deepEqual(
      answer((range) => `=AUTOCORREL(${range},6)`, values),
      [["#NUM!"]],
    );
    assert.deepEqual(
      answer((range) => `=AUTOCORREL(${range},-1)`, values),
      [["#NUM!"]],
    );
    assert.deepEqual(
      answer((range) => `=AUTOCORREL(${range},1.5)`, values),
      [["#NUM!"]],
    );
    assert.deepEqual(
      answer((range) => `=DECOMPOSE(${range},2.5)`, values),
      [["#NUM!"]],
    );
    assert.deepEqual(
      answer((range) => `=EMA(${range},0)`, values),
      [["#NUM!"]],
    );
    assert.deepEqual(
      answer((range) => `=EMA(${range},1.5)`, values),
      [["#NUM!"]],
    );
    assert.deepEqual(
      answer((range) => `=DECOMPOSE(${range},1)`, values),
      [["#NUM!"]],
    );
    assert.deepEqual(
      answer((range) => `=DECOMPOSE(${range},4)`, values),
      [["#NUM!"]],
    );
    assert.deepEqual(
      answer((range) => `=DECOMPOSE(${range},2,"multiplicative")`, [1, 2, 0, 4]),
      [["#NUM!"]],
    );
    assert.deepEqual(
      answer((range) => `=DECOMPOSE(${range},2,"other")`, values),
      [["#VALUE!"]],
    );
  });

  it("decomposes additively when no model is given", () => {
    const series = [10, 20, 12, 22, 14, 24, 16, 26];
    assert.deepEqual(
      answer((range) => `=DECOMPOSE(${range},2)`, series),
      answer((range) => `=DECOMPOSE(${range},2,"additive")`, series),
    );
    assert.notDeepEqual(
      answer((range) => `=DECOMPOSE(${range},2)`, series),
      answer((range) => `=DECOMPOSE(${range},2,"multiplicative")`, series),
    );
  });

  it("has no autocorrelation for a series that never varies", () => {
    assert.deepEqual(
      answer((range) => `=AUTOCORREL(${range},1)`, [2, 2, 2]),
      [["#DIV/0!"]],
    );
  });
});

describe("properties", () => {
  it("an additive decomposition adds back up to the series, and a multiplicative one multiplies", () => {
    const series = Array.from({ length: 24 }, (_, t) => 100 + t + 10 * Math.sin((2 * Math.PI * t) / 6) + ((t * 7) % 5));
    [
      ["additive", (t: number, s: number, r: number) => t + s + r],
      ["multiplicative", (t: number, s: number, r: number) => t * s * r],
    ].forEach(([model, combine]) => {
      const table = answer((range) => `=DECOMPOSE(${range},6,"${String(model)}")`, series);
      table.forEach(([trend, seasonal, residual], index) => {
        if (typeof trend !== "number" || typeof combine !== "function") return;
        close(combine(trend, Number(seasonal), Number(residual)), series[index] ?? 0, `${String(model)} at ${index}`);
      });
    });
  });

  it("EMA with alpha 1 is the series itself, and its last value is a weighted mean of the series", () => {
    const series = [4, 8, 15, 16, 23, 42];
    assert.deepEqual(
      answer((range) => `=EMA(${range},1)`, series),
      series.map((value) => [value]),
    );
    const alpha = 0.4;
    const weights = series.map((_, index) => (index === 0 ? (1 - alpha) ** (series.length - 1) : alpha * (1 - alpha) ** (series.length - 1 - index)));
    const last = answer((range) => `=EMA(${range},${alpha})`, series).at(-1)?.[0] ?? "";
    close(
      last,
      series.reduce((sum, value, index) => sum + value * (weights[index] ?? 0), 0),
      "weights",
    );
  });
});
