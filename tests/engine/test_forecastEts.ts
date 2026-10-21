// FORECAST.ETS, FORECAST.ETS.CONFINT and FORECAST.ETS.SEASONALITY: the model against statsmodels
// (tests/tools/generate_forecast_ets_reference.py), the interval's closed form against its sum, and
// the argument rules through the engine.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SpreadsheetEngine, type CellValue } from "../../src/engine/index.ts";
import {
  detectedSeasonality,
  fitHoltWinters,
  forecastAt,
  intervalAt,
  modelWith,
  type EtsFit,
  type Smoothing,
} from "../../src/engine/functions/forecast-ets-math.ts";
import { isSpreadsheetErrorValue } from "../../src/engine/spreadsheet-errors.ts";
import { lagProducts } from "../../src/engine/functions/fft-math.ts";

const RELATIVE_TOLERANCE = 1e-9;
const OPTIMUM_SLACK = 1.0005;

interface ReferenceCase {
  values: number[];
  period: number;
  smoothing: Smoothing;
  forecasts: number[];
  variance: number;
  optimumVariance: number;
}

const isReferenceCase = (value: unknown): value is ReferenceCase => typeof value === "object" && value !== null && "values" in value && "forecasts" in value;
const parsed: unknown = JSON.parse(readFileSync(new URL("./fixtures/forecast-ets-reference.json", import.meta.url), "utf8"));
const REFERENCE: ReferenceCase[] = Array.isArray(parsed) ? parsed.filter(isReferenceCase) : [];

const close = (actual: number, expected: number, label: string): void => {
  const error = Math.abs(actual - expected) / Math.max(Math.abs(expected), 1);
  assert.ok(error <= RELATIVE_TOLERANCE, `${label}: ${actual} vs ${expected}`);
};

describe("against statsmodels' ExponentialSmoothing", () => {
  REFERENCE.forEach((reference, index) => {
    it(`case ${index} (period ${reference.period})`, () => {
      const fit = modelWith(reference.values, reference.period, reference.smoothing);
      reference.forecasts.forEach((expected, step) => close(forecastAt(fit, step + 1), expected, `step ${step + 1}`));
      close(fit.variance, reference.variance, "variance");
      const chosen = fitHoltWinters(reference.values, reference.period);
      assert.ok(
        !isSpreadsheetErrorValue(chosen) && chosen.variance <= reference.optimumVariance * OPTIMUM_SLACK,
        `${JSON.stringify(chosen)} vs ${reference.optimumVariance}`,
      );
    });
  });
});

/** A deterministic stream in [0, 1). */
function stream(seed: number): () => number {
  const state = { value: seed };
  return () => {
    state.value = (state.value * 1103515245 + 12345) % 2147483648;
    return state.value / 2147483648;
  };
}

describe("the chosen smoothing", () => {
  it("keeps 0 ≤ α, β ≤ 1 and 0 ≤ γ ≤ 1 − α", () => {
    const next = stream(7);
    Array.from({ length: 60 }).forEach((_, index) => {
      const period = [0, 2, 4, 12][index % 4] ?? 0;
      const length = 2 * Math.max(period, 3) + Math.floor(next() * 30);
      const jump = next() * 40;
      const values = Array.from(
        { length },
        (_, t) => (t > length / 2 ? jump : 0) + (period ? 15 * Math.sin((2 * Math.PI * t) / period) * (1 + t / 10) : 0) + next() * 3,
      );
      const fit = fitHoltWinters(values, period);
      assert.ok(!isSpreadsheetErrorValue(fit));
      const { alpha, beta, gamma } = fit.smoothing;
      assert.ok(alpha >= 0 && alpha <= 1 && beta >= 0 && beta <= 1 && gamma >= 0 && gamma <= 1 - alpha + 1e-12, JSON.stringify(fit.smoothing));
    });
  });
});

describe("the interval", () => {
  it("equals z·σ·√(1 + Σⱼ₌₁ᵏ⁻¹ cⱼ²) summed term by term", () => {
    const next = stream(149);
    Array.from({ length: 200 }).forEach(() => {
      const alpha = next();
      const fit: EtsFit = {
        smoothing: { alpha, beta: next(), gamma: next() * (1 - alpha) },
        level: 0,
        trend: 0,
        season: [],
        period: [0, 2, 3, 7, 12][Math.floor(next() * 5)] ?? 0,
        length: 30,
        variance: 1 + next() * 10,
      };
      const steps = 1 + Math.floor(next() * 40);
      const { alpha: a, beta: b, gamma: g } = fit.smoothing;
      const weights = Array.from({ length: steps - 1 }, (_, index) => {
        const j = index + 1;
        return (a + a * b * j + (fit.period !== 0 && j % fit.period === 0 ? g : 0)) ** 2;
      });
      const expected = 1.96 * Math.sqrt(fit.variance * (1 + weights.reduce((total, weight) => total + weight, 0)));
      close(intervalAt(fit, steps, 1.96), expected, JSON.stringify({ fit, steps }));
    });
  });
});

describe("the lag products", () => {
  it("equal Σₜ xₜxₜ₊ₖ summed directly", () => {
    const next = stream(184);
    [1, 2, 3, 5, 8, 16, 17, 100, 257].forEach((length) => {
      const values = Array.from({ length }, () => next() * 20 - 10);
      const products = lagProducts(values, length - 1);
      values.forEach((_, lag) => {
        const direct = values.slice(0, length - lag).reduce((total, value, index) => total + value * (values[index + lag] ?? 0), 0);
        assert.ok(Math.abs((products[lag] ?? 0) - direct) <= 1e-9 * Math.max(1, Math.abs(products[0] ?? 0)), `${length} ${lag}`);
      });
    });
  });
});

describe("the season's length", () => {
  const steps = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

  it("is found under a steep trend, which is removed first", () => {
    assert.equal(detectedSeasonality(steps(24).map((t) => 5 * t + ([1, -1, -1, 1][t % 4] ?? 0))), 4);
  });

  it("is none when the autocorrelation only falls, as over a slow wave", () => {
    assert.equal(detectedSeasonality(steps(30).map((t) => 10 * Math.sin((2 * Math.PI * t) / 40))), 0);
  });

  it("is none when a repeat is longer than half the series", () => {
    assert.equal(detectedSeasonality(steps(20).map((t) => (t % 12 === 2 ? 9 : 0))), 0);
  });
});

/** What each formula answers, beside times in column A and values in column B. */
function answers(times: CellValue[], values: CellValue[], formulas: string[]): CellValue[] {
  const height = Math.max(times.length, formulas.length);
  const data = Array.from({ length: height }, (_, row) => [{ v: times[row] ?? "" }, { v: values[row] ?? "" }, { v: formulas[row] ?? "" }]);
  const [sheet] = new SpreadsheetEngine().calculateWorkbook([{ name: "S", data }]);
  return formulas.map((_, row) => sheet?.data[row]?.[2] ?? "");
}

const range = (count: number): string => `B1:B${count},A1:A${count}`;
const sequence = (count: number, from = 1, step = 1): number[] => Array.from({ length: count }, (_, index) => from + index * step);
const seasonal = (count: number): number[] => sequence(count, 0).map((t) => 50 + 0.5 * t + [6, -2, -7, 3][t % 4] + ((t * 37) % 7) / 10);

describe("FORECAST.ETS", () => {
  it("continues a straight line exactly, with no interval around it", () => {
    const times = sequence(10);
    const values = times.map((t) => 3 + 2 * t);
    const [forecast, interval, plain] = answers(times, values, [
      `=FORECAST.ETS(15,${range(10)})`,
      `=FORECAST.ETS.CONFINT(15,${range(10)})`,
      `=FORECAST.ETS(15,${range(10)},0)`,
    ]);
    assert.equal(forecast, 33);
    assert.equal(interval, 0);
    assert.equal(plain, 33);
  });

  it("finds the season's length, and none in a line or in a short series", () => {
    const times = sequence(24);
    assert.deepEqual(answers(times, seasonal(24), [`=FORECAST.ETS.SEASONALITY(${range(24)})`]), [4]);
    assert.deepEqual(answers(times, times, [`=FORECAST.ETS.SEASONALITY(${range(24)})`]), [0]);
    assert.deepEqual(answers([1, 2, 3], [5, 1, 4], [`=FORECAST.ETS.SEASONALITY(${range(3)})`]), [0]);
  });

  it("forecasts with the detected season as with it given, and differently with none", () => {
    const times = sequence(24);
    const [detected, given, none] = answers(times, seasonal(24), [
      `=FORECAST.ETS(27,${range(24)})`,
      `=FORECAST.ETS(27,${range(24)},4)`,
      `=FORECAST.ETS(27,${range(24)},0)`,
    ]);
    assert.equal(detected, given);
    assert.notEqual(detected, none);
  });

  it("answers the last value smoothed at the last time, and between two steps on the line joining them", () => {
    const times = sequence(24);
    const [at24, at25, at26, between] = answers(times, seasonal(24), [
      `=FORECAST.ETS(24,${range(24)},4)`,
      `=FORECAST.ETS(25,${range(24)},4)`,
      `=FORECAST.ETS(26,${range(24)},4)`,
      `=FORECAST.ETS(25.25,${range(24)},4)`,
    ]);
    assert.ok(typeof at24 === "number" && typeof at25 === "number" && typeof at26 === "number");
    close(Number(between), at25 * 0.75 + at26 * 0.25, "between");
  });

  it("widens the interval the further ahead it looks, and with the confidence", () => {
    const times = sequence(24);
    const formulas = [25, 26, 30, 40].map((target) => `=FORECAST.ETS.CONFINT(${target},${range(24)},0.95,4)`);
    const widths = answers(times, seasonal(24), [...formulas, `=FORECAST.ETS.CONFINT(25,${range(24)},0.5,4)`]).map(Number);
    widths.slice(1, 4).forEach((width, index) => assert.ok(width >= (widths[index] ?? 0), `${widths}`));
    assert.ok((widths[4] ?? 0) < (widths[0] ?? 0));
  });

  it("takes the interval between two steps from the later one, and its z from the two-sided confidence", () => {
    const times = sequence(24);
    const formulas = [25.5, 26].map((target) => `=FORECAST.ETS.CONFINT(${target},${range(24)},0.95,4)`);
    const [between, later, half] = answers(times, seasonal(24), [...formulas, `=FORECAST.ETS.CONFINT(26,${range(24)},0.5,4)`]).map(Number);
    assert.equal(between, later);
    close((later ?? 0) / (half ?? 1), 1.959963984540054 / 0.6744897501960817, "z ratio");
  });

  it("reads the timeline in any order and on any constant step", () => {
    const values = seasonal(16);
    const daily = answers(sequence(16), values, [`=FORECAST.ETS(18,${range(16)},4)`]);
    const weekly = answers(sequence(16, 45000, 7), values, [`=FORECAST.ETS(${45000 + 17 * 7},${range(16)},4)`]);
    const order = sequence(16, 0).reverse();
    const reversed = answers(
      order.map((index) => index + 1),
      order.map((index) => values[index] ?? 0),
      [`=FORECAST.ETS(18,${range(16)},4)`],
    );
    assert.deepEqual(weekly, daily);
    assert.deepEqual(reversed, daily);
  });

  it("combines values at one time by the aggregation, AVERAGE unless given", () => {
    const times = [1, 2, 3, 3, 4, 5];
    const values = [10, 12, 13, 17, 16, 18];
    const formulas = [`=FORECAST.ETS(7,${range(6)},0)`, `=FORECAST.ETS(7,${range(6)},0,1,7)`, `=FORECAST.ETS(7,${range(6)},0,1,6)`];
    const [average, total, least] = answers(times, values, formulas);
    const [byAverage] = answers([1, 2, 3, 4, 5], [10, 12, 15, 16, 18], [`=FORECAST.ETS(7,${range(5)},0)`]);
    const [bySum] = answers([1, 2, 3, 4, 5], [10, 12, 30, 16, 18], [`=FORECAST.ETS(7,${range(5)},0)`]);
    const [byMin] = answers([1, 2, 3, 4, 5], [10, 12, 13, 16, 18], [`=FORECAST.ETS(7,${range(5)},0)`]);
    assert.deepEqual([average, total, least], [byAverage, bySum, byMin]);
  });

  it("fills a missing point on the line between its neighbours, or with 0, and reads a blank value as missing", () => {
    const times = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11];
    const values = [4, 6, 5, 9, 8, 10, 12, 11, 13, 14];
    const formula = (completion: string): string => `=FORECAST.ETS(13,${range(10)},0${completion})`;
    const [interpolated, zeros] = answers(times, values, [formula(""), formula(",0")]);
    const full = sequence(11);
    const [byLine, byZero] = [7, 0].map((fill) => answers(full, [4, 6, 5, fill, 9, 8, 10, 12, 11, 13, 14], [`=FORECAST.ETS(13,${range(11)},0)`])[0]);
    const [blank] = answers(full, [4, 6, 5, "", 9, 8, 10, 12, 11, 13, 14], [`=FORECAST.ETS(13,${range(11)},0)`]);
    assert.deepEqual([interpolated, zeros, blank], [byLine, byZero, byLine]);
  });

  it("keeps a blank value's time, inside the series or at either end, as a missing point to fill", () => {
    const formula = (completion: string): string => `=FORECAST.ETS(6,${range(4)},0${completion})`;
    const [inside, insideZero] = answers(sequence(4), [10, "", 20, 25], [formula(""), formula(",0")]);
    assert.deepEqual([inside, insideZero], [answers(sequence(4), [10, 15, 20, 25], [formula("")])[0], answers(sequence(4), [10, 0, 20, 25], [formula("")])[0]]);
    const atEnd = (values: CellValue[]): CellValue => answers(sequence(7), values, [`=FORECAST.ETS(9,${range(7)},0)`])[0] ?? "";
    assert.equal(atEnd([4, 6, 5, 9, 8, 10, ""]), atEnd([4, 6, 5, 9, 8, 10, 10]));
    assert.equal(atEnd(["", 6, 5, 9, 8, 10, 12]), atEnd([6, 6, 5, 9, 8, 10, 12]));
    assert.deepEqual(answers(sequence(4), [10, "", "", 25], [formula("")]), ["#NUM!"]);
  });

  it("answers #NUM! for a step that is not constant, too many missing points, or a target before the end", () => {
    assert.deepEqual(answers([1, 2, 3.5, 4, 5], [1, 2, 3, 4, 5], [`=FORECAST.ETS(7,${range(5)})`]), ["#NUM!"]);
    assert.deepEqual(answers([1, 2, 5, 6], [1, 2, 3, 4], [`=FORECAST.ETS(7,${range(4)})`]), ["#NUM!"]);
    assert.deepEqual(answers(sequence(5), sequence(5), [`=FORECAST.ETS(4,${range(5)})`]), ["#NUM!"]);
    assert.deepEqual(answers([1, 2, 3, 4, 5.5, 6.5, 7.5, 8.5], sequence(8), [`=FORECAST.ETS(10,${range(8)},0)`]), ["#NUM!"]);
    assert.deepEqual(answers([5, 5, 5], [1, 2, 3], [`=FORECAST.ETS(6,${range(3)},0)`]), ["#NUM!"]);
    assert.deepEqual(answers([5, 5, 5], [1, 2, 3], [`=FORECAST.ETS.SEASONALITY(${range(3)})`]), ["#NUM!"]);
  });

  it("answers #NUM! for a seasonality, data_completion, aggregation or confidence outside its values", () => {
    const formulas = [
      `=FORECAST.ETS(9,${range(8)},1.5)`,
      `=FORECAST.ETS(9,${range(8)},-1)`,
      `=FORECAST.ETS(9,${range(8)},8761)`,
      `=FORECAST.ETS(9,${range(8)},4.5)`,
      `=FORECAST.ETS(9,${range(8)},0,2)`,
      `=FORECAST.ETS(9,${range(8)},0,0.5)`,
      `=FORECAST.ETS(9,${range(8)},0,1,8)`,
      `=FORECAST.ETS.CONFINT(9,${range(8)},0)`,
      `=FORECAST.ETS.CONFINT(9,${range(8)},1)`,
      `=FORECAST.ETS.SEASONALITY(${range(8)},3)`,
    ];
    assert.deepEqual(
      answers(sequence(8), seasonal(8), formulas),
      formulas.map(() => "#NUM!"),
    );
  });

  it("answers #NUM! for fewer than two seasons of values, or fewer than three points without a season", () => {
    assert.deepEqual(answers(sequence(7), seasonal(7), [`=FORECAST.ETS(9,${range(7)},4)`]), ["#NUM!"]);
    assert.deepEqual(answers([1, 2], [3, 4], [`=FORECAST.ETS(3,${range(2)},0)`]), ["#NUM!"]);
  });

  it("answers #N/A for different sizes, #VALUE! for text or a blank time, and an error cell's error", () => {
    assert.deepEqual(answers(sequence(5), sequence(5), ["=FORECAST.ETS(6,B1:B5,A1:A4)"]), ["#N/A"]);
    assert.deepEqual(answers(sequence(5), [1, 2, "x", 4, 5], [`=FORECAST.ETS(6,${range(5)})`]), ["#VALUE!"]);
    assert.deepEqual(answers([1, 2, "", 4, 5], sequence(5), [`=FORECAST.ETS(6,${range(5)})`]), ["#VALUE!"]);
    assert.deepEqual(answers(sequence(5), [1, 2, "=1/0", 4, 5], [`=FORECAST.ETS(6,${range(5)})`]), ["#DIV/0!"]);
    assert.deepEqual(answers(sequence(5), sequence(5), [`=FORECAST.ETS(1/0,${range(5)})`]), ["#DIV/0!"]);
  });

  it("fits each series on its own when several are forecast", () => {
    const data = sequence(12).map((t) => [{ v: t }, { v: t * 2 }, { v: t * 3 }]);
    data.push([{ v: "=FORECAST.ETS(14,B1:B12,A1:A12)" }, { v: "=FORECAST.ETS(14,C1:C12,A1:A12)" }, { v: "" }]);
    const [sheet] = new SpreadsheetEngine().calculateWorkbook([{ name: "S", data }]);
    assert.deepEqual(sheet?.data[12]?.slice(0, 2), [28, 42]);
  });
});
