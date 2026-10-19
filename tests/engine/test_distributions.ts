// The t and normal distributions, T.TEST and CONFIDENCE. Four independent checks:
//   - fixtures/distribution-reference.json, computed at 50 digits by
//     tests/tools/generate_distribution_reference.py, matched at a relative error of 1e-9
//   - shapes with a closed form (t with 1 and 2 degrees of freedom)
//   - quantile(cdf(x)) == x over generated x (seed printed; rerun with DISTRIBUTION_SEED=<seed>)
//   - the worked examples in Microsoft's documentation, to the digits it shows
// jstat was measured first and is not used: its t cdf is off by 3.6e-8 against the closed
// forms and its normal tail at z = -8 by 2%, both above the 1e-9 bar.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalCdf,
  normalDensity,
  normalQuantile,
  normalUpperTail,
  studentCdf,
  studentDensity,
  studentQuantile,
  studentUpperQuantile,
  studentUpperTail,
} from "../../src/engine/functions/distribution-math.ts";
import { logBeta, logGamma } from "../../src/engine/functions/special-functions.ts";
import { valuesOf } from "./formulaColumns.ts";
import { seededRandom } from "./seededRandom.ts";

const RELATIVE_TOLERANCE = 1e-9;
// Past 1e7 degrees of freedom the incomplete beta's continued fraction loses digits as x nears 1.
// Up to |t| = 4 a power series takes over and holds 1e-9; beyond it the right tail is good to
// about 2e-8 at df = 1e9 (measured). Meeting 1e-9 there needs an expansion for a huge shape,
// such as DiDonato and Morris's BGRAT.
const LARGE_DF = 1e7;
const SERIES_T = 4;
const LARGE_DF_TOLERANCE = 3e-8;
const tailTolerance = (t: number, df: number): number => (df > LARGE_DF && Math.abs(t) > SERIES_T ? LARGE_DF_TOLERANCE : RELATIVE_TOLERANCE);
// A reference that is 0 (the median of a symmetric distribution) has no relative error.
const ABSOLUTE_FLOOR = 1e-12;

const assertClose = (actual: unknown, expected: number, label: string, tolerance = RELATIVE_TOLERANCE): void => {
  assert.equal(typeof actual, "number", `${label}: ${String(actual)} is not a number`);
  const error = Math.abs(Number(actual) - expected) / Math.max(Math.abs(expected), ABSOLUTE_FLOOR);
  assert.ok(error <= tolerance, `${label}: ${String(actual)} vs ${expected} (relative error ${error.toExponential(2)})`);
};

interface Reference {
  t: { t: number; df: number; upper: number; density: number }[];
  tQuantile: { q: number; df: number; t: number }[];
  normal: { z: number; upper: number; density: number }[];
  normalQuantile: { p: number; z: number }[];
  tTest: { first: number[]; second: number[]; type: number; tails: number; p: number }[];
  logGamma: { x: number; value: number }[];
  logBeta: { a: number; b: number; value: number }[];
}

const isReference = (value: unknown): value is Reference =>
  typeof value === "object" &&
  value !== null &&
  ["t", "tQuantile", "normal", "normalQuantile", "tTest", "logGamma", "logBeta"].every((key) => Array.isArray(Reflect.get(value, key)));

const parsed: unknown = JSON.parse(readFileSync(new URL("./fixtures/distribution-reference.json", import.meta.url), "utf8"));
assert.ok(isReference(parsed), "the reference fixture has every section");
const reference = parsed;

// Tighter than the distributions need: the tails multiply exp(ln B) by small numbers, so the
// log functions are held to what double precision can give.
const LOG_TOLERANCE = 1e-13;

const assertLogClose = (actual: number, expected: number, label: string): void => {
  const error = Math.abs(actual - expected) / Math.max(Math.abs(expected), 1);
  assert.ok(error <= LOG_TOLERANCE, `${label}: ${actual} vs ${expected} (error ${error.toExponential(2)})`);
};

describe("log gamma and log beta against 50-digit references", () => {
  it("matches ln Γ on both sides of the Stirling switch", () => {
    reference.logGamma.forEach(({ x, value }) => assertLogClose(logGamma(x), value, `ln Γ(${x})`));
  });

  it("matches ln B, a large argument included", () => {
    reference.logBeta.forEach(({ a, b, value }) => {
      assertLogClose(logBeta(a, b), value, `ln B(${a}, ${b})`);
      assertLogClose(logBeta(b, a), value, `ln B(${b}, ${a})`);
    });
  });
});

describe("Student's t against 50-digit references", () => {
  it("matches the upper tail and the density", () => {
    reference.t.forEach(({ t, df, upper, density }) => {
      assertClose(studentUpperTail(t, df), upper, `upper tail t=${t} df=${df}`, tailTolerance(t, df));
      assertClose(studentDensity(t, df), density, `density t=${t} df=${df}`);
    });
  });

  it("matches the quantile, down to an upper tail of 1e-300", () => {
    reference.tQuantile.forEach(({ q, df, t }) => assertClose(studentUpperQuantile(q, df), t, `quantile q=${q} df=${df}`));
  });
});

describe("the standard normal against 50-digit references", () => {
  it("matches the upper tail and the density", () => {
    reference.normal.forEach(({ z, upper, density }) => {
      assertClose(normalUpperTail(z), upper, `upper tail z=${z}`);
      assertClose(normalDensity(z), density, `density z=${z}`);
    });
  });

  it("matches the quantile", () => {
    reference.normalQuantile.forEach(({ p, z }) => assertClose(normalQuantile(p), z, `quantile p=${p}`));
  });
});

// Each closed form is written without a subtraction that cancels for a large negative t.
const cauchyCdf = (t: number): number => (t < 0 ? Math.atan(-1 / t) / Math.PI : 0.5 + Math.atan(t) / Math.PI);
const twoDfCdf = (t: number): number => {
  const root = Math.sqrt(2 + t * t);
  return t < 0 ? 1 / (root * (root - t)) : 0.5 + t / (2 * root);
};

describe("closed forms", () => {
  const ts = [-1e6, -30, -3, -1, -0.25, 0, 0.25, 1, 3, 30, 1e6];

  it("t with 1 degree of freedom is the Cauchy distribution", () => {
    ts.forEach((t) => {
      assertClose(studentCdf(t, 1), cauchyCdf(t), `cdf t=${t}`);
      assertClose(studentDensity(t, 1), 1 / (Math.PI * (1 + t * t)), `density t=${t}`);
    });
  });

  it("t with 2 degrees of freedom has a closed-form cdf", () => {
    ts.forEach((t) => assertClose(studentCdf(t, 2), twoDfCdf(t), `cdf t=${t}`));
  });

  it("the normal cdf at 0 is a half, and the two tails add to 1", () => {
    assert.equal(normalCdf(0), 0.5);
    [0.3, 1.7, 4].forEach((z) => assertClose(normalCdf(z) + normalCdf(-z), 1, `z=${z}`));
  });
});

const baseSeed = Number(process.env.DISTRIBUTION_SEED ?? Date.now() % 1_000_000);
const ROUND_TRIPS = 300;

describe("quantiles invert the cdfs over generated values", () => {
  it(`returns t from studentQuantile(studentCdf(t)) (seed ${baseSeed})`, () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: ROUND_TRIPS }).forEach(() => {
      const df = Math.ceil(random() * 200);
      const t = (random() - 0.5) * 12;
      // Far out, the cdf rounds to 1 and loses t; the upper tail keeps it.
      assertClose(studentUpperQuantile(studentUpperTail(t, df), df), t, `seed ${baseSeed} t=${t} df=${df}`);
    });
  });

  it(`returns z from normalQuantile(normalCdf(z)) (seed ${baseSeed})`, () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: ROUND_TRIPS }).forEach(() => {
      const z = -(random() * 30);
      assertClose(normalQuantile(normalCdf(z)), z, `seed ${baseSeed} z=${z}`);
    });
  });

  // 1 − p is exact for these p, so both sides ask the same question.
  it("is symmetric about the median", () => {
    [0.125, 0.25, 0.375].forEach((p) => {
      assert.equal(studentQuantile(p, 7), -studentQuantile(1 - p, 7));
      assert.equal(normalQuantile(p), -normalQuantile(1 - p));
    });
    assert.ok(Object.is(studentQuantile(0.5, 7), 0), "0, not -0");
    assert.ok(Object.is(normalQuantile(0.5), 0), "0, not -0");
  });
});

const roundedTo = (digits: number, value: unknown): number => Number(Number(value).toFixed(digits));

describe("Microsoft's worked examples", () => {
  it("T.TEST", () => {
    const first = [3, 4, 5, 8, 9, 1, 2, 4, 5];
    const second = [6, 19, 3, 2, 14, 4, 5, 17, 1];
    const [paired, alias] = valuesOf(["=T.TEST(A1:A9,B1:B9,2,1)", "=TTEST(A1:A9,B1:B9,2,1)"], [first, second]);
    assert.equal(roundedTo(6, paired), 0.196016);
    assert.equal(alias, paired);
  });

  it("T.DIST, T.DIST.2T, T.DIST.RT, T.INV, T.INV.2T", () => {
    const values = valuesOf([
      "=T.DIST(60,1,TRUE)",
      "=T.DIST(8,3,FALSE)",
      "=T.DIST.2T(1.959999998,60)",
      "=T.DIST.RT(1.959999998,60)",
      "=T.INV(0.75,2)",
      "=T.INV.2T(0.546449,60)",
    ]);
    assert.deepEqual(
      [roundedTo(8, values[0]), roundedTo(8, values[1]), roundedTo(6, values[2]), roundedTo(6, values[3]), roundedTo(7, values[4]), roundedTo(6, values[5])],
      [0.99469533, 0.00073691, 0.054645, 0.027322, 0.8164966, 0.606533],
    );
  });

  it("NORM.DIST, NORM.S.DIST, NORM.INV, NORM.S.INV", () => {
    const values = valuesOf([
      "=NORM.DIST(42,40,1.5,TRUE)",
      "=NORM.DIST(42,40,1.5,FALSE)",
      "=NORM.S.DIST(1.333333,TRUE)",
      "=NORM.S.DIST(1.333333,FALSE)",
      "=NORM.INV(0.908789,40,1.5)",
      "=NORM.S.INV(0.908789)",
    ]);
    assert.deepEqual(
      [roundedTo(7, values[0]), roundedTo(5, values[1]), roundedTo(9, values[2]), roundedTo(9, values[3]), roundedTo(6, values[4]), roundedTo(7, values[5])],
      [0.9087888, 0.10934, 0.908788726, 0.164010148, 42.000002, 1.3333347],
    );
  });

  it("CONFIDENCE.NORM and CONFIDENCE.T", () => {
    const [normal, student] = valuesOf(["=CONFIDENCE.NORM(0.05,2.5,50)", "=CONFIDENCE.T(0.05,1,50)"]);
    assert.equal(roundedTo(6, normal), 0.692952);
    assert.equal(roundedTo(9, student), 0.284196855);
  });
});

describe("T.TEST against 50-digit references", () => {
  it("matches each sample pair, type and tail count", () => {
    reference.tTest.forEach(({ first, second, type, tails, p }) => {
      const [value] = valuesOf([`=T.TEST(A1:A${first.length},B1:B${second.length},${tails},${type})`], [first, second]);
      assertClose(value, p, `type ${type} tails ${tails} on ${JSON.stringify(first)}`);
    });
  });
});

describe("T.TEST arguments", () => {
  const columns = [
    [1, 2, 3, 4],
    [2, 2, 5, 7],
  ];

  it("truncates tails and type, and refuses any other", () => {
    const [truncated, plain, ...refused] = valuesOf(
      [
        "=T.TEST(A1:A4,B1:B4,2.9,3.9)",
        "=T.TEST(A1:A4,B1:B4,2,3)",
        "=T.TEST(A1:A4,B1:B4,0,2)",
        "=T.TEST(A1:A4,B1:B4,3,2)",
        "=T.TEST(A1:A4,B1:B4,2,0)",
        "=T.TEST(A1:A4,B1:B4,2,4)",
      ],
      columns,
    );
    assert.equal(truncated, plain);
    assert.deepEqual(refused, ["#NUM!", "#NUM!", "#NUM!", "#NUM!"]);
  });

  it("answers #N/A for paired ranges of different sizes, and #DIV/0! with too little data", () => {
    assert.deepEqual(valuesOf(["=T.TEST(A1:A4,B1:B3,2,1)", "=T.TEST(A1:A1,B1:B1,2,2)", "=T.TEST(A1:A4,B1:B1,2,3)"], columns), ["#N/A", "#DIV/0!", "#DIV/0!"]);
  });

  it("answers #DIV/0! when nothing varies", () => {
    assert.deepEqual(
      valuesOf(
        ["=T.TEST(A1:A3,B1:B3,2,1)", "=T.TEST(A1:A3,B1:B3,2,2)"],
        [
          [5, 5, 5],
          [5, 5, 5],
        ],
      ),
      ["#DIV/0!", "#DIV/0!"],
    );
  });

  it("skips cells that hold no number, keeping pairs aligned", () => {
    const [withGaps, compact] = valuesOf(
      ["=T.TEST(A1:A5,B1:B5,2,1)", "=T.TEST(A6:A9,B6:B9,2,1)"],
      [
        [1, "x", 2, 3, 4, 1, 2, 3, 4],
        [2, 9, 2, "", 5, 2, 2, 0, 5],
      ],
    );
    assert.equal(typeof withGaps, "number");
    assert.notEqual(withGaps, compact, "row 4 has no pair, so it drops out of the paired test");
  });

  it('drops a row whose cell holds nothing or answers "", as CORREL does', () => {
    // Rows 2-4 each lose their B cell a different way; D:E hold the rows that remain.
    const data: SheetData["data"] = [
      [{ v: 1 }, { v: 2 }, { v: "" }, { v: 1 }, { v: 2 }],
      [{ v: 5 }, { v: null }],
      [{ v: 6 }, {}],
      [{ v: 7 }, { v: '=IF(TRUE,"",1)' }],
      [{ v: 3 }, { v: 4 }, { v: "" }, { v: 3 }, { v: 4 }],
      [{ v: 4 }, { v: 9 }, { v: "" }, { v: 4 }, { v: 9 }],
      [{ v: "=T.TEST(A1:A6,B1:B6,2,1)" }, { v: "=T.TEST(D1:D6,E1:E6,2,1)" }, { v: "=CORREL(A1:A6,B1:B6)" }, { v: "=CORREL(D1:D6,E1:E6)" }],
    ];
    const grid = new SpreadsheetEngine().calculate({ name: "S", data } satisfies SheetData).data;
    const [gapped, compact, gappedCorrel, compactCorrel] = [0, 1, 2, 3].map((col) => cellAt(grid, 6, col));
    assert.equal(typeof compact, "number");
    assert.equal(gapped, compact);
    assert.equal(gappedCorrel, compactCorrel, "the pairing CORREL uses");
  });
});

describe("argument rules", () => {
  it("truncates degrees of freedom and refuses one below 1", () => {
    const [truncated, plain, ...refused] = valuesOf([
      "=T.DIST(1,2.9,TRUE)",
      "=T.DIST(1,2,TRUE)",
      "=T.DIST(1,0.9,TRUE)",
      "=T.DIST.RT(1,0)",
      "=T.INV(0.3,0)",
      "=T.INV.2T(0.3,-1)",
    ]);
    assert.equal(truncated, plain);
    assert.deepEqual(refused, ["#NUM!", "#NUM!", "#NUM!", "#NUM!"]);
  });

  it("refuses a probability outside (0, 1), and T.INV.2T(1) is 0", () => {
    assert.deepEqual(valuesOf(["=T.INV(0,5)", "=T.INV(1,5)", "=T.INV.2T(0,5)", "=T.INV.2T(1.5,5)", "=T.INV.2T(1,5)", "=NORM.INV(0,0,1)", "=NORM.S.INV(1)"]), [
      "#NUM!",
      "#NUM!",
      "#NUM!",
      "#NUM!",
      0,
      "#NUM!",
      "#NUM!",
    ]);
  });

  it("refuses a negative x for T.DIST.2T and a standard deviation that is not positive", () => {
    assert.deepEqual(valuesOf(["=T.DIST.2T(-0.5,5)", "=NORM.DIST(1,0,0,TRUE)", "=NORM.INV(0.5,0,-1)", "=CONFIDENCE.NORM(0.05,0,10)"]), [
      "#NUM!",
      "#NUM!",
      "#NUM!",
      "#NUM!",
    ]);
  });

  it("checks and truncates the confidence arguments", () => {
    const [truncated, plain, ...rest] = valuesOf([
      "=CONFIDENCE.T(0.05,1,50.7)",
      "=CONFIDENCE.T(0.05,1,50)",
      "=CONFIDENCE.T(0.05,1,1)",
      "=CONFIDENCE.T(0,1,10)",
      "=CONFIDENCE.NORM(1,1,10)",
      "=CONFIDENCE.NORM(0.05,1,0.5)",
    ]);
    assert.equal(truncated, plain);
    assert.deepEqual(rest, ["#DIV/0!", "#NUM!", "#NUM!", "#NUM!"]);
  });

  it("reads cumulative as Excel's truthiness", () => {
    const [cdf, density, ...same] = valuesOf(["=NORM.S.DIST(1,TRUE)", "=NORM.S.DIST(1,FALSE)", "=NORM.S.DIST(1,1)", "=NORM.S.DIST(1,0)"]);
    assert.deepEqual(same, [cdf, density]);
  });

  it("passes an error in the cumulative argument through, rather than reading it as TRUE", () => {
    assert.deepEqual(valuesOf(["=NORM.S.DIST(1,A1)", "=T.DIST(1,5,A1)", "=NORM.DIST(1,0,1,A1)"], [["=1/0"]]), ["#DIV/0!", "#DIV/0!", "#DIV/0!"]);
  });

  it("answers an error cell in either T.TEST range, in every type", () => {
    const columns = [
      ["=1/0", 2, 3, 4],
      [2, 3, 5, "=SQRT(-1)"],
    ];
    assert.deepEqual(valuesOf(["=T.TEST(A1:A4,B1:B4,2,1)", "=T.TEST(A1:A4,B1:B4,2,2)", "=T.TEST(A1:A4,B1:B4,2,3)", "=T.TEST(B1:B4,A1:A4,2,3)"], columns), [
      "#DIV/0!",
      "#DIV/0!",
      "#DIV/0!",
      "#NUM!",
    ]);
  });

  it("passes an error argument through", () => {
    assert.deepEqual(valuesOf(["=T.DIST(1/0,5,TRUE)", "=NORM.INV(0.5,1/0,1)", '=T.DIST.RT("x",5)']), ["#DIV/0!", "#DIV/0!", "#VALUE!"]);
  });

  it("is read inside a larger formula", () => {
    const [nested] = valuesOf(["=1+T.DIST.2T(2,10)*100"]);
    assertClose(nested, 1 + 2 * studentUpperTail(2, 10) * 100, "nested");
  });
});
