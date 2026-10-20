// F.TEST, Z.TEST, CHISQ.TEST, and ANOVA.TEST, MANNWHITNEY.TEST, WILCOXON.TEST, KS.TEST and
// SHAPIRO.TEST, which Excel does not have. Checked against references computed independently
// (fixtures/hypothesis-tests-reference.json, from tests/tools/generate_hypothesis_tests_reference.py,
// itself checked against scipy.stats), Microsoft's worked examples, the argument rules, and
// properties that hold whatever the data. Generated cases print their seed; rerun one with
// HYPOTHESIS_SEED=<seed>.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { valuesOf } from "./formulaColumns.ts";
import { seededRandom, type Random } from "./seededRandom.ts";

const RELATIVE_TOLERANCE = 1e-9;
const ABSOLUTE_FLOOR = 1e-300;

const isClose = (actual: unknown, expected: number, tolerance = RELATIVE_TOLERANCE): boolean =>
  typeof actual === "number" && Math.abs(actual - expected) <= tolerance * Math.abs(expected) + ABSOLUTE_FLOOR;

interface ReferenceCase {
  formula: string;
  columns: number[][];
  value: string;
}

const isNumberColumns = (value: unknown): value is number[][] =>
  Array.isArray(value) && value.every((column) => Array.isArray(column) && column.every((cell) => typeof cell === "number"));
const isReferenceCase = (value: unknown): value is ReferenceCase =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "formula") === "string" &&
  typeof Reflect.get(value, "value") === "string" &&
  isNumberColumns(Reflect.get(value, "columns"));
const parsed: unknown = JSON.parse(readFileSync(new URL("./fixtures/hypothesis-tests-reference.json", import.meta.url), "utf8"));
const referenceCases: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "cases") : undefined;
assert.ok(Array.isArray(referenceCases) && referenceCases.every(isReferenceCase), "the reference fixture holds cases");
const cases: ReferenceCase[] = referenceCases.filter(isReferenceCase);

describe("against independently computed references", () => {
  it("answers every case of the fixture within 1e-9", () => {
    cases.forEach(({ formula, columns, value }) => {
      const [answer] = valuesOf([formula], columns);
      assert.ok(isClose(answer, Number(value)), `${formula}: ${String(answer)} vs ${value}`);
    });
  });

  it("covers every test, on both sides of each switch between an exact and a normal p", () => {
    const names = new Set(cases.map(({ formula }) => formula.slice(1, formula.indexOf("("))));
    ["F.TEST", "Z.TEST", "CHISQ.TEST", "ANOVA.TEST", "MANNWHITNEY.TEST", "WILCOXON.TEST", "KS.TEST", "SHAPIRO.TEST"].forEach((name) =>
      assert.ok(names.has(name), name),
    );
    const sizes = (name: string): number[] =>
      cases.filter(({ formula }) => formula.startsWith(`=${name}(`)).map(({ columns }) => Math.min(...columns.map((column) => column.length)));
    assert.ok(sizes("MANNWHITNEY.TEST").some((size) => size <= 8) && sizes("MANNWHITNEY.TEST").some((size) => size > 8));
    assert.ok(sizes("WILCOXON.TEST").some((size) => size <= 50) && sizes("WILCOXON.TEST").some((size) => size > 50));
    assert.ok(cases.some(({ formula, columns }) => formula.startsWith("=KS.TEST(") && (columns[0]?.length ?? 0) * (columns[1]?.length ?? 0) > 10_000_000));
  });
});

describe("Microsoft's worked examples", () => {
  it("F.TEST, Z.TEST and CHISQ.TEST", () => {
    const [fTest] = valuesOf(
      ["=F.TEST(A1:A5,B1:B5)"],
      [
        [6, 7, 9, 15, 21],
        [20, 28, 31, 38, 40],
      ],
    );
    assert.ok(isClose(fTest, 0.64831785, 1e-8), String(fTest));
    const [above4, above6] = valuesOf(["=Z.TEST(A1:A10,4)", "=Z.TEST(A1:A10,6)"], [[3, 6, 7, 8, 6, 5, 4, 2, 1, 9]]);
    assert.ok(isClose(above4, 0.090574, 1e-5) && isClose(above6, 0.863043, 1e-6), `${String(above4)} ${String(above6)}`);
    const [chiSquare] = valuesOf(
      ["=CHISQ.TEST(A1:B3,C1:D3)"],
      [
        [58, 11, 10],
        [35, 25, 23],
        [45.35, 17.56, 16.09],
        [47.65, 18.44, 16.91],
      ],
    );
    assert.ok(isClose(chiSquare, 0.0003082, 1e-4), String(chiSquare));
  });
});

describe("argument rules", () => {
  it("F.TEST needs two values that vary in each sample", () => {
    assert.deepEqual(valuesOf(["=F.TEST(A1,B1:B3)", "=F.TEST(A1:A3,C1:C3)", "=F.TEST(B1:B3,D1:D3)"], [[1, 2, 3], [4, 6, 9], [5, 5, 5], []]), [
      "#DIV/0!",
      "#DIV/0!",
      "#DIV/0!",
    ]);
  });

  it("Z.TEST: no values #N/A, sigma not positive #NUM!, one value without sigma #DIV/0!", () => {
    assert.deepEqual(
      valuesOf(["=Z.TEST(B1:B3,1)", "=Z.TEST(A1:A3,1,0)", "=Z.TEST(A1:A3,1,-2)", "=Z.TEST(A1,1)", "=Z.TEST(C1:C3,1)"], [[1, 2, 3], [], [4, 4, 4]]),
      ["#N/A", "#NUM!", "#NUM!", "#DIV/0!", "#DIV/0!"],
    );
    const [withSigma] = valuesOf(["=Z.TEST(A1,1,2)"], [[3]]);
    assert.ok(isClose(withSigma, 0.15865525393145707, 1e-12), String(withSigma));
  });

  it("CHISQ.TEST: tables of different shapes or a single cell #N/A, an expected 0 or no numbers #DIV/0!", () => {
    const columns = [
      [10, 20, 30],
      [11, 19, 0],
      [12, 18, 31],
    ];
    assert.deepEqual(
      valuesOf(["=CHISQ.TEST(A1:A3,C1:C2)", "=CHISQ.TEST(A1:B2,A1:A4)", "=CHISQ.TEST(A1,C1)", "=CHISQ.TEST(A1:A3,B1:B3)", "=CHISQ.TEST(E1:E3,C1:C3)"], columns),
      ["#N/A", "#N/A", "#N/A", "#DIV/0!", "#DIV/0!"],
    );
  });

  it("CHISQ.TEST takes its degrees of freedom from the shape: (r−1)(c−1), or the cells less one", () => {
    const columns = [
      [10, 20],
      [30, 40],
      [12, 18],
      [33, 37],
    ];
    const [table, row] = valuesOf(["=CHISQ.TEST(A1:B2,C1:D2)", "=CHISQ.TEST(A1:A2,C1:C2)"], columns);
    const tableStatistic = 4 / 12 + 4 / 18 + 9 / 33 + 9 / 37;
    const [byTable, byRow] = valuesOf([`=CHISQ.DIST.RT(${tableStatistic},1)`, `=CHISQ.DIST.RT(${4 / 12 + 4 / 18},1)`]);
    assert.ok(isClose(table, Number(byTable)) && isClose(row, Number(byRow)), `${String(table)} ${String(row)}`);
  });

  it("ANOVA.TEST needs two groups, a value in each, and spread within them", () => {
    assert.deepEqual(valuesOf(["=ANOVA.TEST(A1:A3,D1:D3)", "=ANOVA.TEST(A1,B1)", "=ANOVA.TEST(C1:C2,B1:B2)"], [[1, 2, 3], [4, 4], [7, 7], []]), [
      "#DIV/0!",
      "#DIV/0!",
      "#DIV/0!",
    ]);
  });

  it("the rank tests and SHAPIRO.TEST answer #DIV/0! with too little to rank", () => {
    assert.deepEqual(
      valuesOf(
        [
          "=MANNWHITNEY.TEST(A1:A3,D1:D3)",
          "=MANNWHITNEY.TEST(B1:B3,C1:C3)",
          "=WILCOXON.TEST(A1:A3,A1:A3)",
          "=KS.TEST(D1:D3,A1:A3)",
          "=SHAPIRO.TEST(A1:A2)",
          "=SHAPIRO.TEST(B1:B3)",
        ],
        [[1, 2, 3], [5, 5, 5], [5, 5, 5], []],
      ),
      ["#DIV/0!", "#DIV/0!", "#DIV/0!", "#DIV/0!", "#DIV/0!", "#DIV/0!"],
    );
  });

  it("WILCOXON.TEST pairs its two ranges row by row: ranges of different sizes #N/A", () => {
    assert.deepEqual(
      valuesOf(
        ["=WILCOXON.TEST(A1:A3,B1:B2)"],
        [
          [1, 2, 3],
          [4, 5],
        ],
      ),
      ["#N/A"],
    );
  });

  it("KS.TEST of two samples that never differ is 1", () => {
    assert.deepEqual(
      valuesOf(
        ["=KS.TEST(A1:A4,B1:B4)"],
        [
          [1, 2, 3, 4],
          [4, 3, 2, 1],
        ],
      ),
      [1],
    );
  });

  it("answers the first error cell, in argument order, and an error in a scalar argument", () => {
    const columns = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    const tests = ["F.TEST", "CHISQ.TEST", "MANNWHITNEY.TEST", "WILCOXON.TEST", "KS.TEST", "ANOVA.TEST"];
    const formulas = [
      ...tests.map((name) => `=${name}(A1:A4,B1:B4)`),
      "=SHAPIRO.TEST(A1:A4)",
      "=Z.TEST(A1:A4,1)",
      "=Z.TEST(A1:A3,1/0)",
      "=Z.TEST(A1:A3,1,1/0)",
    ];
    const withErrors = [
      [...(columns[0] ?? []), "=1/0"],
      [...(columns[1] ?? []), "=SQRT(-1)"],
    ];
    assert.deepEqual(valuesOf(formulas, withErrors), [...tests.map(() => "#DIV/0!"), "#DIV/0!", "#DIV/0!", "#DIV/0!", "#DIV/0!"]);
    assert.deepEqual(valuesOf(["=KS.TEST(B1:B4,A1:A4)"], withErrors), ["#NUM!"]);
  });

  it("skips text and blanks in a range", () => {
    const [withText, without] = valuesOf(
      ["=SHAPIRO.TEST(A1:A8)", "=SHAPIRO.TEST(B1:B6)"],
      [
        [3.1, "x", 4.7, 2.2, "", 5.9, 3.3, 4.1],
        [3.1, 4.7, 2.2, 5.9, 3.3, 4.1],
      ],
    );
    assert.equal(withText, without);
  });

  it("names FTEST, ZTEST and CHITEST as the functions they became", () => {
    const columns = [
      [6, 7, 9, 15, 21],
      [20, 28, 31, 38, 40],
    ];
    const answers = valuesOf(
      ["=FTEST(A1:A5,B1:B5)", "=F.TEST(A1:A5,B1:B5)", "=ZTEST(A1:A5,8)", "=Z.TEST(A1:A5,8)", "=CHITEST(A1:A5,B1:B5)", "=CHISQ.TEST(A1:A5,B1:B5)"],
      columns,
    );
    [0, 2, 4].forEach((index) => assert.equal(answers[index], answers[index + 1]));
  });
});

const baseSeed = Number(process.env.HYPOTHESIS_SEED ?? Date.now() % 1_000_000);
const GENERATED_CASES = 60;

const sample = (random: Random, count: number, spread: number, shift = 0): number[] =>
  Array.from({ length: count }, () => Math.round((random() * spread + shift) * 100) / 100);
const columnRange = (letter: string, length: number): string => `${letter}1:${letter}${length}`;

describe(`properties over generated samples (seed ${baseSeed})`, () => {
  it("a two-group ANOVA is the equal-variance t-test, and the two-sample tests do not care which sample is first", () => {
    const random = seededRandom(baseSeed);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const [m, n] = [2 + Math.floor(random() * 25), 2 + Math.floor(random() * 25)];
      const columns = [sample(random, m, 40), sample(random, n, 40, random() * 10)];
      const [a, b] = [columnRange("A", m), columnRange("B", n)];
      const answers = valuesOf(
        [
          `=ANOVA.TEST(${a},${b})`,
          `=T.TEST(${a},${b},2,2)`,
          ...["F.TEST", "MANNWHITNEY.TEST", "KS.TEST"].flatMap((name) => [`=${name}(${a},${b})`, `=${name}(${b},${a})`]),
        ],
        columns,
      );
      const label = `seed ${baseSeed}: ${JSON.stringify(columns)}`;
      assert.ok(isClose(answers[0], Number(answers[1]), 1e-8), `${label}: ANOVA ${String(answers[0])} vs T.TEST ${String(answers[1])}`);
      [2, 4, 6].forEach((index) =>
        assert.ok(isClose(answers[index], Number(answers[index + 1]), 1e-12), `${label}: ${String(answers[index])} vs ${String(answers[index + 1])}`),
      );
      answers.forEach((answer) => assert.ok(typeof answer === "number" && answer >= 0 && answer <= 1, `${label}: ${String(answer)}`));
    });
  });

  it("SHAPIRO.TEST does not change when the values are shifted or scaled, and WILCOXON.TEST of two ranges is that of their differences", () => {
    const random = seededRandom(baseSeed + 1);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const n = 3 + Math.floor(random() * 40);
      const values = sample(random, n, 30);
      const other = sample(random, n, 30);
      const columns = [values, values.map((value) => value * 4 + 1000), values.map((value, index) => value - (other[index] ?? 0)), other];
      const [plain, moved, differences, paired] = valuesOf(
        [
          `=SHAPIRO.TEST(${columnRange("A", n)})`,
          `=SHAPIRO.TEST(${columnRange("B", n)})`,
          `=WILCOXON.TEST(${columnRange("C", n)})`,
          `=WILCOXON.TEST(${columnRange("A", n)},${columnRange("D", n)})`,
        ],
        columns,
      );
      const label = `seed ${baseSeed}: ${JSON.stringify(values)}`;
      if (typeof plain === "number") assert.ok(isClose(moved, plain, 1e-7), `${label}: ${String(moved)} vs ${plain}`);
      else assert.equal(moved, plain);
      assert.equal(paired, differences, label);
    });
  });

  it("Z.TEST above x and above the mirrored x of the mirrored sample sum to 1", () => {
    const random = seededRandom(baseSeed + 2);
    Array.from({ length: GENERATED_CASES }).forEach(() => {
      const n = 2 + Math.floor(random() * 30);
      const values = sample(random, n, 30);
      const x = Math.round(random() * 3000) / 100;
      const [above, mirrored] = valuesOf([`=Z.TEST(A1:A${n},${x})`, `=Z.TEST(B1:B${n},${-x})`], [values, values.map((value) => -value)]);
      if (typeof above === "number") assert.ok(isClose(above + Number(mirrored), 1, 1e-12), `seed ${baseSeed}: ${String(above)} + ${String(mirrored)}`);
    });
  });
});
