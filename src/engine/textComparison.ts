/**
 * Excel comparison (`=` `<>` `<` `>` `<=` `>=`) over values of any type.
 *
 * Comparison binds looser than `&`, so `A1&B1="12"` compares the joined text.
 * Excel orders numbers before text before booleans, compares text without regard
 * to case, and never finds a number equal to text (`"12"=12` is FALSE). A chain
 * reads left to right: `1=1=TRUE` is `(1=1)=TRUE`.
 */

import type { CellValue } from "./types";
import { placesOf } from "./concatPrecedence";

export type ExcelComparisonOperator = "=" | "<>" | "<" | ">" | "<=" | ">=";

const OPERATORS: readonly ExcelComparisonOperator[] = ["<>", "<=", ">=", "=", "<", ">"];
const COMPARISON_CHARS = "=<>!";

export interface ComparisonChain {
  operands: string[];
  operators: ExcelComparisonOperator[];
}

interface OperatorRun {
  start: number;
  text: string;
}

/** Each run of comparison characters outside literals and brackets. */
function topLevelOperatorRuns(expr: string): OperatorRun[] {
  const runs: OperatorRun[] = [];
  placesOf(expr).forEach((place, index) => {
    if (place.inLiteral || place.depth !== 0 || !COMPARISON_CHARS.includes(place.char)) return;
    const last = runs.at(-1);
    if (last !== undefined && last.start + last.text.length === index) last.text += place.char;
    else runs.push({ start: index, text: place.char });
  });
  return runs;
}

const isExcelOperator = (text: string): text is ExcelComparisonOperator => OPERATORS.some((operator) => operator === text);

/** The operands and operators of a top-level comparison chain; null when there is none, or when a
 *  run is not one of Excel's six operators (`==`, `!=`) or an operand is empty. */
export function splitTopLevelComparisons(expr: string): ComparisonChain | null {
  const runs = topLevelOperatorRuns(expr);
  if (runs.length === 0) return null;
  const operators = runs.map((run) => run.text);
  if (!operators.every(isExcelOperator)) return null;
  const bounds = [{ start: 0, text: "" }, ...runs].map((run, index) => ({ from: run.start + run.text.length, to: runs[index]?.start ?? expr.length }));
  const operands = bounds.map(({ from, to }) => expr.slice(from, to).trim());
  if (operands.some((operand) => operand === "")) return null;
  return { operands, operators: operators.filter(isExcelOperator) };
}

const NUMBER_RANK = 0;
const TEXT_RANK = 1;
const BOOLEAN_RANK = 2;

const rankOf = (value: CellValue): number => {
  if (typeof value === "number") return NUMBER_RANK;
  return typeof value === "boolean" ? BOOLEAN_RANK : TEXT_RANK;
};

/** Negative, zero or positive as `left` sorts before, with or after `right` in Excel's order. */
export function compareCellValues(left: CellValue, right: CellValue): number {
  const rankGap = rankOf(left) - rankOf(right);
  if (rankGap !== 0) return rankGap;
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  const leftText = String(left).toLowerCase();
  const rightText = String(right).toLowerCase();
  if (leftText === rightText) return 0;
  return leftText < rightText ? -1 : 1;
}

const OUTCOME: Readonly<Record<ExcelComparisonOperator, (ordering: number) => boolean>> = {
  "=": (ordering) => ordering === 0,
  "<>": (ordering) => ordering !== 0,
  "<": (ordering) => ordering < 0,
  ">": (ordering) => ordering > 0,
  "<=": (ordering) => ordering <= 0,
  ">=": (ordering) => ordering >= 0,
};

export function applyComparison(operator: ExcelComparisonOperator, left: CellValue, right: CellValue): boolean {
  return OUTCOME[operator](compareCellValues(left, right));
}

/** Fold a chain left to right; `values` holds one more entry than `operators`. */
export function foldComparisons(values: CellValue[], operators: ExcelComparisonOperator[]): CellValue {
  return operators.reduce<CellValue>((left, operator, index) => applyComparison(operator, left, values[index + 1] ?? ""), values[0] ?? "");
}
