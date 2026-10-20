/**
 * The tests that answer a p value: F.TEST, Z.TEST and CHISQ.TEST as Excel has them, and
 * ANOVA.TEST, MANNWHITNEY.TEST, WILCOXON.TEST, KS.TEST and SHAPIRO.TEST, which Excel, LibreOffice
 * and Google Sheets do not have. Each range is read once, blank-aware, and the first error cell
 * in argument order is the answer; the rules live in hypothesis-tests-math.ts.
 */

import { blankAwareRangeReader, functionRegistry, requiredArg, type FunctionContext, type FunctionHandler } from "../registry";
import { isSpreadsheetErrorValue, NA_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import type { CellValue } from "../types";
import { referenceBounds } from "./reference-math";
import { numberArg } from "./distribution-args";
import { rangeNumbers } from "./statistical";
import { numericPairs } from "./analysis-math";
import {
  chiSquareTest,
  fTest,
  kolmogorovSmirnov,
  mannWhitney,
  oneWayAnova,
  shapiroWilk,
  wilcoxonSignedRank,
  zTest,
  type TableShape,
} from "./hypothesis-tests-math";

const MAX_GROUPS = 255;

/** The cells of the first `count` arguments, each range read once, or the first error among them. */
function readRanges(args: string[], context: FunctionContext, count: number): CellValue[][] | SpreadsheetError {
  const read = blankAwareRangeReader(context);
  const ranges = Array.from({ length: count }, (_, index) => read(requiredArg(context, args, index)));
  return ranges.flat().find(isSpreadsheetErrorValue) ?? ranges;
}

/** A test over the numbers of each of its range arguments. */
const overSamples =
  (count: (args: string[]) => number, rule: (samples: number[][]) => CellValue): FunctionHandler =>
  (args, context) => {
    const ranges = readRanges(args, context, count(args));
    return Array.isArray(ranges) ? rule(ranges.map(rangeNumbers)) : ranges;
  };

const twoSamples = (rule: (first: number[], second: number[]) => CellValue): FunctionHandler =>
  overSamples(
    () => 2,
    ([first = [], second = []]) => rule(first, second),
  );

const zTestHandler: FunctionHandler = (args, context) => {
  const ranges = readRanges(args, context, 1);
  if (!Array.isArray(ranges)) return ranges;
  const x = numberArg(args, context, 1);
  if (typeof x !== "number") return x;
  const sigma = args.length > 2 ? numberArg(args, context, 2) : undefined;
  return typeof sigma === "number" || sigma === undefined ? zTest(rangeNumbers(ranges[0] ?? []), x, sigma) : sigma;
};

/** The rows and columns of a range argument; anything that is not a reference reads as one row. */
function tableShape(arg: string, cellCount: number): TableShape {
  const bounds = referenceBounds(arg);
  return bounds ? { rows: bounds.endRow - bounds.startRow + 1, columns: bounds.endCol - bounds.startCol + 1 } : { rows: 1, columns: cellCount };
}

/** CHISQ.TEST(actual, expected): the two tables must have the same shape (#N/A otherwise), and
 *  the cells where both hold a number are compared. */
const chiSquareTestHandler: FunctionHandler = (args, context) => {
  const ranges = readRanges(args, context, 2);
  if (!Array.isArray(ranges)) return ranges;
  const [observed = [], expected = []] = ranges;
  const [observedShape, expectedShape] = [
    tableShape(requiredArg(context, args, 0), observed.length),
    tableShape(requiredArg(context, args, 1), expected.length),
  ];
  if (observedShape.rows !== expectedShape.rows || observedShape.columns !== expectedShape.columns) return NA_ERROR;
  const pairs = numericPairs(observed, expected);
  return "ys" in pairs ? chiSquareTest(pairs.ys, pairs.xs, observedShape) : pairs;
};

/** WILCOXON.TEST(range) tests the values against 0; WILCOXON.TEST(range1, range2) the differences
 *  of the rows where both hold a number, as T.TEST's paired type pairs them. */
const wilcoxonHandler: FunctionHandler = (args, context) => {
  const ranges = readRanges(args, context, args.length);
  if (!Array.isArray(ranges)) return ranges;
  const [first = [], second] = ranges;
  if (second === undefined) return wilcoxonSignedRank(rangeNumbers(first));
  const pairs = numericPairs(first, second);
  return "ys" in pairs ? wilcoxonSignedRank(pairs.ys.map((y, index) => y - (pairs.xs[index] ?? 0))) : pairs;
};

interface TestFunction {
  name: string;
  handler: FunctionHandler;
  minArgs: number;
  maxArgs: number;
  description: string;
  examples: string[];
}

const TEST_FUNCTIONS: TestFunction[] = [
  {
    name: "F.TEST",
    handler: twoSamples(fTest),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the two-tailed p-value of an F-test that two samples have the same variance",
    examples: ["F.TEST(A2:A20, B2:B20)"],
  },
  {
    name: "Z.TEST",
    handler: zTestHandler,
    minArgs: 2,
    maxArgs: 3,
    description: "Returns the one-tailed p-value of a z-test that the mean exceeds x",
    examples: ["Z.TEST(A2:A20, 4)", "Z.TEST(A2:A20, 4, 1.5)"],
  },
  {
    name: "CHISQ.TEST",
    handler: chiSquareTestHandler,
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the p-value of a chi-square test of observed against expected counts",
    examples: ["CHISQ.TEST(B2:C4, E2:F4)"],
  },
  {
    name: "ANOVA.TEST",
    handler: overSamples((args) => args.length, oneWayAnova),
    minArgs: 2,
    maxArgs: MAX_GROUPS,
    description: "Returns the p-value of a one-way analysis of variance across two or more groups",
    examples: ["ANOVA.TEST(A2:A20, B2:B20, C2:C20)"],
  },
  {
    name: "MANNWHITNEY.TEST",
    handler: twoSamples(mannWhitney),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the two-sided p-value of the Mann-Whitney U test of two independent samples",
    examples: ["MANNWHITNEY.TEST(A2:A20, B2:B20)"],
  },
  {
    name: "WILCOXON.TEST",
    handler: wilcoxonHandler,
    minArgs: 1,
    maxArgs: 2,
    description: "Returns the two-sided p-value of the Wilcoxon signed-rank test, of one sample against 0 or of paired differences",
    examples: ["WILCOXON.TEST(A2:A20)", "WILCOXON.TEST(A2:A20, B2:B20)"],
  },
  {
    name: "KS.TEST",
    handler: twoSamples(kolmogorovSmirnov),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the two-sided p-value of the two-sample Kolmogorov-Smirnov test",
    examples: ["KS.TEST(A2:A20, B2:B20)"],
  },
  {
    name: "SHAPIRO.TEST",
    handler: overSamples(
      () => 1,
      ([values = []]) => shapiroWilk(values),
    ),
    minArgs: 1,
    maxArgs: 1,
    description: "Returns the p-value of the Shapiro-Wilk test that a sample comes from a normal distribution",
    examples: ["SHAPIRO.TEST(A2:A50)"],
  },
];

TEST_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Statistical" }));
