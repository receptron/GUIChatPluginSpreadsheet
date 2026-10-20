/**
 * Reading the arguments of the functions that take tables: a table (a range as `=A1:B3` reads it,
 * a spilling call's table, or one value as a 1×1 table), and numbers and flags that may be left out.
 */

import { answersTable, requiredArg, type FunctionContext } from "../registry";
import { coerceToBoolean } from "../coerce-boolean";
import { rowsOfRange } from "../cellArray";
import { toScalarNumber } from "../numericCoercion";
import { isSpreadsheetErrorValue, type SpreadsheetError } from "../spreadsheet-errors";
import { isSoleRangeReference } from "../spillCandidate";
import type { CellArray } from "../types";

export type Read<T> = T | SpreadsheetError;

const isLeftOut = (args: string[], index: number): boolean => index >= args.length || args[index]?.trim() === "";

/** A table argument. */
export function tableArg(args: string[], context: FunctionContext, index: number): CellArray {
  const arg = requiredArg(context, args, index);
  if (answersTable(arg) && context.getRangeGrid) return context.getRangeGrid(arg);
  const rows = isSoleRangeReference(arg) && context.getRangeValuesRaw ? rowsOfRange(arg, context.getRangeValuesRaw) : null;
  if (rows) return rows;
  // A single value, an error included, is a 1×1 table: HSTACK(1/0, A1:A2) keeps the error as a cell.
  return [[context.evaluateFormula(arg)]];
}

export const numberArg = (args: string[], context: FunctionContext, index: number): Read<number> =>
  toScalarNumber(context.evaluateFormula(requiredArg(context, args, index)));

/** A number that may be left out: `fallback` then. */
export const optionalNumberArg = (args: string[], context: FunctionContext, index: number, fallback: number): Read<number> =>
  isLeftOut(args, index) ? fallback : numberArg(args, context, index);

/** A count that may be left out (TAKE's and DROP's): undefined then. */
export const optionalCountArg = (args: string[], context: FunctionContext, index: number): Read<number> | undefined =>
  isLeftOut(args, index) ? undefined : numberArg(args, context, index);

export function booleanArg(args: string[], context: FunctionContext, index: number): Read<boolean> {
  if (isLeftOut(args, index)) return false;
  const value = context.evaluateFormula(requiredArg(context, args, index));
  return isSpreadsheetErrorValue(value) ? value : coerceToBoolean(value);
}

/** The values read in argument order, or the first error among them. */
export function allRead<T>(values: Read<T>[]): T[] | SpreadsheetError {
  const failed = values.find((value): value is SpreadsheetError => isSpreadsheetErrorValue(value));
  return failed ?? values.filter((value): value is T => !isSpreadsheetErrorValue(value));
}
