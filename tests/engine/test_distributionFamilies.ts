// The chi-square, F, gamma, beta, lognormal, Weibull, exponential, binomial, Poisson,
// hypergeometric and negative binomial distributions, and PHI, GAUSS, FISHER and FISHERINV.
// Checked against 50-digit references (fixtures/distribution-families-reference.json, from
// tests/tools/generate_distribution_families_reference.py), Microsoft's worked examples, Excel's
// argument rules, and properties that hold whatever the formulas are. Generated cases print their
// seed; rerun one with FAMILIES_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SpreadsheetEngine, type SheetData } from "../../src/engine/index.ts";
import { cellAt } from "./cellAccess.ts";
import { pick, seededRandom } from "./seededRandom.ts";

const RELATIVE_TOLERANCE = 1e-9;
// A reference far below the doubles' resolution near 1 has no relative error to speak of.
const ABSOLUTE_FLOOR = 1e-300;

function valuesOf(formulas: string[]): unknown[] {
  const grid = new SpreadsheetEngine().calculate({ name: "S", data: formulas.map((v) => [{ v }]) } satisfies SheetData).data;
  return formulas.map((_, row) => cellAt(grid, row, 0));
}

const isClose = (actual: unknown, expected: number, tolerance = RELATIVE_TOLERANCE): boolean =>
  typeof actual === "number" && (Math.abs(actual - expected) <= tolerance * Math.abs(expected) || Math.abs(actual - expected) <= ABSOLUTE_FLOOR);

interface ReferenceCase {
  formula: string;
  value: string | number;
}

const isReferenceCase = (value: unknown): value is ReferenceCase =>
  typeof value === "object" && value !== null && typeof Reflect.get(value, "formula") === "string";
const parsed: unknown = JSON.parse(readFileSync(new URL("./fixtures/distribution-families-reference.json", import.meta.url), "utf8"));
const referenceCases: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "cases") : undefined;
assert.ok(Array.isArray(referenceCases) && referenceCases.every(isReferenceCase), "the reference fixture holds cases");
const cases: ReferenceCase[] = referenceCases.filter(isReferenceCase);

describe("against 50-digit references", () => {
  it("answers every formula of the fixture within 1e-9", () => {
    const answers = valuesOf(cases.map(({ formula }) => formula));
    cases.forEach(({ formula, value }, index) => assert.ok(isClose(answers[index], Number(value)), `${formula}: ${String(answers[index])} vs ${value}`));
  });

  it("covers every function it is meant to", () => {
    const names = new Set(cases.map(({ formula }) => formula.slice(1, formula.indexOf("("))));
    [
      "CHISQ.DIST",
      "CHISQ.DIST.RT",
      "CHISQ.INV",
      "CHISQ.INV.RT",
      "F.DIST",
      "F.DIST.RT",
      "F.INV",
      "F.INV.RT",
      "GAMMA.DIST",
      "GAMMA.INV",
      "BETA.DIST",
      "BETA.INV",
    ].forEach((name) => assert.ok(names.has(name), name));
    ["LOGNORM.DIST", "WEIBULL.DIST", "EXPON.DIST", "BINOM.DIST", "BINOM.INV", "POISSON.DIST", "HYPGEOM.DIST", "NEGBINOM.DIST", "GAMMALN"].forEach((name) =>
      assert.ok(names.has(name), name),
    );
  });
});

describe("Microsoft's worked examples", () => {
  // Each with one unit in the last digit Microsoft prints.
  const examples: [string, number, number][] = [
    ["=CHISQ.DIST(0.5,1,TRUE)", 0.52049988, 1e-8],
    ["=CHISQ.INV.RT(0.050001,10)", 18.30697346, 1e-8],
    ["=F.DIST(15.2069,6,4,TRUE)", 0.99, 1e-6],
    ["=F.INV.RT(0.01,6,4)", 15.20686, 1e-5],
    ["=BINOM.DIST(6,10,0.5,FALSE)", 0.2050781, 1e-7],
    ["=BINOM.INV(6,0.5,0.75)", 4, 0],
    ["=POISSON.DIST(2,5,TRUE)", 0.124652, 1e-5],
    ["=HYPGEOM.DIST(1,4,8,20,TRUE)", 0.4654, 1e-4],
    ["=NEGBINOM.DIST(10,5,0.25,TRUE)", 0.3135141, 1e-7],
    ["=EXPON.DIST(0.2,10,FALSE)", 1.35335283, 1e-8],
    ["=GAMMA.INV(0.068094,9,2)", 10.0000112, 1e-6],
    ["=GAMMALN(4)", 1.7917595, 1e-7],
    ["=BETA.DIST(2,8,10,TRUE,1,3)", 0.6854706, 1e-7],
    ["=BETA.INV(0.685470581,8,10,1,3)", 2, 1e-8],
    ["=LOGNORM.INV(0.039084,3.5,1.2)", 4.0000252, 1e-6],
    ["=WEIBULL.DIST(105,20,100,FALSE)", 0.035589, 1e-5],
    ["=PHI(0.75)", 0.301137432, 1e-8],
    ["=GAUSS(2)", 0.47724987, 1e-7],
    ["=FISHER(0.75)", 0.9729551, 1e-7],
    ["=FISHERINV(0.972955)", 0.75, 1e-6],
  ];

  it("answers each one to the digits Microsoft gives", () => {
    const answers = valuesOf(examples.map(([formula]) => formula));
    examples.forEach(([formula, expected, digits], index) => {
      const answer = answers[index];
      assert.ok(typeof answer === "number" && Math.abs(answer - expected) <= digits, `${formula}: ${String(answer)}`);
    });
  });
});

describe("argument rules", () => {
  it("answers #NUM! for degrees of freedom below 1 or above 10^10, and truncates them", () => {
    assert.deepEqual(valuesOf(["=CHISQ.DIST(1,0.9,TRUE)", "=CHISQ.DIST.RT(1,1e11)", "=F.DIST(1,0,3,TRUE)", "=F.INV(0.5,3,0)"]), [
      "#NUM!",
      "#NUM!",
      "#NUM!",
      "#NUM!",
    ]);
    const [truncated, whole] = valuesOf(["=CHISQ.DIST(2,3.9,TRUE)", "=CHISQ.DIST(2,3,TRUE)"]);
    assert.equal(truncated, whole);
  });

  it("answers #NUM! outside each distribution's support", () => {
    assert.deepEqual(
      valuesOf([
        "=CHISQ.DIST(-1,2,TRUE)",
        "=F.DIST.RT(-1,2,3)",
        "=GAMMA.DIST(-1,2,1,TRUE)",
        "=EXPON.DIST(-1,2,TRUE)",
        "=WEIBULL.DIST(-1,2,1,TRUE)",
        "=LOGNORM.DIST(0,0,1,TRUE)",
        "=BETA.DIST(4,2,3,TRUE,1,3)",
        "=FISHER(1)",
      ]),
      ["#NUM!", "#NUM!", "#NUM!", "#NUM!", "#NUM!", "#NUM!", "#NUM!", "#NUM!"],
    );
  });

  it("answers #NUM! for parameters that are not positive", () => {
    assert.deepEqual(
      valuesOf(["=GAMMA.DIST(1,0,1,TRUE)", "=GAMMA.INV(0.5,1,0)", "=EXPON.DIST(1,0,TRUE)", "=BETA.DIST(0.5,0,1,TRUE)", "=LOGNORM.INV(0.5,0,0)", "=GAMMALN(0)"]),
      ["#NUM!", "#NUM!", "#NUM!", "#NUM!", "#NUM!", "#NUM!"],
    );
  });

  it("answers #NUM! for a probability outside its range", () => {
    assert.deepEqual(
      valuesOf([
        "=CHISQ.INV(-0.1,2)",
        "=F.INV.RT(1.1,2,3)",
        "=GAMMA.INV(1,2,1)",
        "=BETA.INV(0,2,3)",
        "=LOGNORM.INV(1,0,1)",
        "=BINOM.DIST(1,3,1.5,TRUE)",
        "=BINOM.INV(5,0.5,1.5)",
      ]),
      ["#NUM!", "#NUM!", "#NUM!", "#NUM!", "#NUM!", "#NUM!", "#NUM!"],
    );
  });

  it("answers #NUM! where an inverse's quantile is infinite, and the finite end where it is not", () => {
    assert.deepEqual(valuesOf(["=CHISQ.INV(1,2)", "=CHISQ.INV.RT(0,2)", "=F.INV(1,2,3)", "=F.INV.RT(0,2,3)", "=CHIINV(0,2)", "=FINV(0,2,3)"]), [
      "#NUM!",
      "#NUM!",
      "#NUM!",
      "#NUM!",
      "#NUM!",
      "#NUM!",
    ]);
    assert.deepEqual(valuesOf(["=CHISQ.INV(0,2)", "=CHISQ.INV.RT(1,2)", "=F.INV(0,2,3)", "=F.INV.RT(1,2,3)", "=BETA.INV(1,2,3,1,3)"]), [0, 0, 0, 0, 3]);
  });

  it("answers #NUM! for counts out of range, and truncates them", () => {
    assert.deepEqual(
      valuesOf([
        "=BINOM.DIST(11,10,0.5,TRUE)",
        "=BINOM.DIST(-1,10,0.5,TRUE)",
        "=POISSON.DIST(-1,2,TRUE)",
        "=NEGBINOM.DIST(1,0,0.5,TRUE)",
        "=HYPGEOM.DIST(5,4,8,20,TRUE)",
        "=HYPGEOM.DIST(1,25,8,20,TRUE)",
        "=HYPGEOM.DIST(5,10,4,20,TRUE)",
      ]),
      ["#NUM!", "#NUM!", "#NUM!", "#NUM!", "#NUM!", "#NUM!", "#NUM!"],
    );
    assert.deepEqual(valuesOf(["=BINOM.DIST(6.9,10.2,0.5,FALSE)"]), valuesOf(["=BINOM.DIST(6,10,0.5,FALSE)"]));
  });

  it("answers BINOM.INV with the count whose cumulative is exactly alpha", () => {
    assert.deepEqual(valuesOf(["=BINOM.INV(1,0.5,0.5)", "=BINOM.INV(2,0.5,0.25)", "=BINOM.INV(3,0.5,0.5)", "=BINOM.INV(4,0.5,0.6875)"]), [0, 0, 1, 2]);
  });

  it("scales BETA.DIST's density by the width of its bounds", () => {
    const [scaled, unit] = valuesOf(["=BETA.DIST(2,8,10,FALSE,1,3)", "=BETA.DIST(0.5,8,10,FALSE)"]);
    assert.ok(isClose(scaled, Number(unit) / 2), String(scaled));
  });

  it("passes an error argument through, the cumulative flag included", () => {
    assert.deepEqual(valuesOf(["=CHISQ.DIST(1/0,2,TRUE)", "=BINOM.DIST(1,3,0.5,1/0)", "=BETA.DIST(0.5,2,3,TRUE,1/0)"]), ["#DIV/0!", "#DIV/0!", "#DIV/0!"]);
  });

  it("names the old functions as their new ones", () => {
    const pairs: [string, string][] = [
      ["=CHIDIST(3,4)", "=CHISQ.DIST.RT(3,4)"],
      ["=CHIINV(0.2,4)", "=CHISQ.INV.RT(0.2,4)"],
      ["=FDIST(2,3,4)", "=F.DIST.RT(2,3,4)"],
      ["=FINV(0.2,3,4)", "=F.INV.RT(0.2,3,4)"],
      ["=BINOMDIST(3,8,0.4,TRUE)", "=BINOM.DIST(3,8,0.4,TRUE)"],
      ["=CRITBINOM(8,0.4,0.6)", "=BINOM.INV(8,0.4,0.6)"],
      ["=POISSON(3,2,FALSE)", "=POISSON.DIST(3,2,FALSE)"],
      ["=EXPONDIST(1,2,TRUE)", "=EXPON.DIST(1,2,TRUE)"],
      ["=GAMMADIST(3,2,1,TRUE)", "=GAMMA.DIST(3,2,1,TRUE)"],
      ["=GAMMAINV(0.3,2,1)", "=GAMMA.INV(0.3,2,1)"],
      ["=GAMMALN.PRECISE(4.5)", "=GAMMALN(4.5)"],
      ["=BETAINV(0.3,2,3)", "=BETA.INV(0.3,2,3)"],
      ["=LOGINV(0.3,1,2)", "=LOGNORM.INV(0.3,1,2)"],
      ["=WEIBULL(2,3,4,TRUE)", "=WEIBULL.DIST(2,3,4,TRUE)"],
    ];
    const answers = valuesOf(pairs.flat());
    pairs.forEach(([old], index) => assert.equal(answers[index * 2], answers[index * 2 + 1], old));
  });
});

const baseSeed = Number(process.env.FAMILIES_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 120;
const BINOMIAL_TIE_TOLERANCE = 1e-12;

describe(`properties over generated parameters (seed ${baseSeed})`, () => {
  it("the left and right tails sum to 1, and each inverse undoes its distribution", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const [df1, df2] = [1 + Math.floor(random() * 60), 1 + Math.floor(random() * 60)];
      const x = Math.round(random() * 4000) / 100 + 0.01;
      const p = Math.round(random() * 9998 + 1) / 10000;
      const [chiLeft, chiRight, fLeft, fRight, chiBack, fBack, chiBackRight, fBackRight] = valuesOf([
        `=CHISQ.DIST(${x},${df1},TRUE)`,
        `=CHISQ.DIST.RT(${x},${df1})`,
        `=F.DIST(${x},${df1},${df2},TRUE)`,
        `=F.DIST.RT(${x},${df1},${df2})`,
        `=CHISQ.DIST(CHISQ.INV(${p},${df1}),${df1},TRUE)`,
        `=F.DIST(F.INV(${p},${df1},${df2}),${df1},${df2},TRUE)`,
        `=CHISQ.DIST.RT(CHISQ.INV.RT(${p},${df1}),${df1})`,
        `=F.DIST.RT(F.INV.RT(${p},${df1},${df2}),${df1},${df2})`,
      ]);
      const label = `seed ${baseSeed}: x ${x}, p ${p}, df ${df1}/${df2}`;
      assert.ok(isClose(Number(chiLeft) + Number(chiRight), 1), label);
      assert.ok(isClose(Number(fLeft) + Number(fRight), 1), label);
      [chiBack, fBack, chiBackRight, fBackRight].forEach((back) => assert.ok(isClose(back, p, 1e-8), `${label}: ${String(back)}`));
    });
  });

  it("the masses sum to the cumulative, and BINOM.INV is the first count to reach alpha", () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: GENERATED_CASES / 4 }).forEach(() => {
      const trials = 1 + Math.floor(random() * 40);
      const p = Math.round(random() * 98 + 1) / 100;
      const successes = Math.floor(random() * (trials + 1));
      const masses = valuesOf(Array.from({ length: successes + 1 }, (_, s) => `=BINOM.DIST(${s},${trials},${p},FALSE)`));
      const [cumulative] = valuesOf([`=BINOM.DIST(${successes},${trials},${p},TRUE)`]);
      const total = masses.reduce((sum: number, mass) => sum + Number(mass), 0);
      const label = `seed ${baseSeed}: ${successes} of ${trials} at ${p}`;
      assert.ok(isClose(cumulative, total, 1e-12), label);
      const alpha = pick(random, [0.05, 0.5, 0.9]);
      const [quantile] = valuesOf([`=BINOM.INV(${trials},${p},${alpha})`]);
      const k = Number(quantile);
      const [atK, belowK] = valuesOf([`=BINOM.DIST(${k},${trials},${p},TRUE)`, `=BINOM.DIST(${k - 1},${trials},${p},TRUE)`]);
      // A cumulative within BINOM.INV's tie tolerance of alpha reaches it: BINOM.DIST(0,1,0.1,TRUE) reads 0.8999999999999999.
      const reached = alpha * (1 - BINOMIAL_TIE_TOLERANCE);
      assert.ok(Number(atK) >= reached && (k === 0 || Number(belowK) < reached), `${label}: BINOM.INV ${k}`);
    });
  });
});
