/**
 * MMULT, MINVERSE, MDETERM, MUNIT and FREQUENCY. A matrix argument is a range, a spilling call's
 * table or one number; any cell that is not a number — a blank, text, a logical value — is #VALUE!,
 * and an error cell is that error. The rules live in matrix-math.ts.
 */

import { functionRegistry, isSpillingCall, requiredArg, type FunctionContext, type FunctionHandler } from "../registry";
import { isSpreadsheetErrorValue, VALUE_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import { isSoleReference } from "../spillCandidate";
import type { CellValue } from "../types";
import { determinant, frequency, identity, inverse, multiply, type Matrix } from "./matrix-math";
import { numberArg } from "./table-args";
import { fitsInSheet } from "../cellArray";

/** The matrix an argument holds, or #VALUE! for a cell that is not a number, or the first error cell. */
function matrixArg(args: string[], context: FunctionContext, index: number): Matrix | SpreadsheetError {
  const arg = requiredArg(context, args, index);
  const cells: CellValue[][] = context.getRangeGrid ? context.getRangeGrid(arg) : [[context.evaluateFormula(arg)]];
  const firstError = cells.flat().find(isSpreadsheetErrorValue);
  if (firstError) return firstError;
  const numbers = cells.map((row) => row.filter((cell): cell is number => typeof cell === "number"));
  return numbers.every((row, rowIndex) => row.length === (cells[rowIndex]?.length ?? 0)) ? numbers : VALUE_ERROR;
}

/** FREQUENCY's data and bins: the numbers of a range or a spilling call's table (other cells left
 *  out), or the one number written. */
function numbersArg(args: string[], context: FunctionContext, index: number): number[] | SpreadsheetError {
  const arg = requiredArg(context, args, index);
  if (isSoleReference(arg) || isSpillingCall(arg)) {
    const cells = context.getRangeValuesKeepingBlanks?.(arg) ?? context.getRangeValues(arg);
    return cells.find(isSpreadsheetErrorValue) ?? cells.filter((cell): cell is number => typeof cell === "number");
  }
  const value = context.evaluateFormula(arg);
  if (isSpreadsheetErrorValue(value)) return value;
  return typeof value === "number" ? [value] : [];
}

const mmultHandler: FunctionHandler = (args, context) => {
  const left = matrixArg(args, context, 0);
  if (isSpreadsheetErrorValue(left)) return left;
  const right = matrixArg(args, context, 1);
  return isSpreadsheetErrorValue(right) ? right : multiply(left, right);
};

const matrixHandler =
  (rule: (matrix: Matrix) => Matrix | number | SpreadsheetError): FunctionHandler =>
  (args, context) => {
    const matrix = matrixArg(args, context, 0);
    return isSpreadsheetErrorValue(matrix) ? matrix : rule(matrix);
  };

const munitHandler: FunctionHandler = (args, context) => {
  const size = numberArg(args, context, 0);
  if (typeof size !== "number") return size;
  const side = Math.trunc(size);
  return side < 1 || !fitsInSheet(side, side) ? VALUE_ERROR : identity(side);
};

const frequencyHandler: FunctionHandler = (args, context) => {
  const values = numbersArg(args, context, 0);
  if (!Array.isArray(values)) return values;
  const bins = numbersArg(args, context, 1);
  return Array.isArray(bins) ? frequency(values, bins).map((count) => [count]) : bins;
};

interface MatrixFunction {
  name: string;
  handler: FunctionHandler;
  minArgs: number;
  maxArgs: number;
  description: string;
  examples: string[];
  category: string;
  spills: boolean;
}

const MATRIX_FUNCTIONS: MatrixFunction[] = [
  {
    name: "MMULT",
    handler: mmultHandler,
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the matrix product of two ranges; the first's width must be the second's height; spills",
    examples: ["MMULT(A1:B3, D1:E2)"],
    category: "Mathematical",
    spills: true,
  },
  {
    name: "MINVERSE",
    handler: matrixHandler(inverse),
    minArgs: 1,
    maxArgs: 1,
    description: "Returns the inverse of a square matrix (#NUM! when it has none); spills",
    examples: ["MINVERSE(A1:C3)"],
    category: "Mathematical",
    spills: true,
  },
  {
    name: "MDETERM",
    handler: matrixHandler(determinant),
    minArgs: 1,
    maxArgs: 1,
    description: "Returns the determinant of a square matrix",
    examples: ["MDETERM(A1:C3)"],
    category: "Mathematical",
    spills: false,
  },
  {
    name: "MUNIT",
    handler: munitHandler,
    minArgs: 1,
    maxArgs: 1,
    description: "Returns the identity matrix of the given size; spills",
    examples: ["MUNIT(3)"],
    category: "Mathematical",
    spills: true,
  },
  {
    name: "FREQUENCY",
    handler: frequencyHandler,
    minArgs: 2,
    maxArgs: 2,
    description: "Counts the values at or below each bin and above the one before it, then those above every bin; spills one column",
    examples: ["FREQUENCY(A2:A100, C2:C5)"],
    category: "Statistical",
    spills: true,
  },
];

MATRIX_FUNCTIONS.forEach((definition) => functionRegistry.register(definition));
