/**
 * Reading the arguments of the distribution functions: numbers, a cumulative flag, and degrees
 * of freedom truncated as Excel truncates them.
 */

import { requiredArg, type FunctionContext, type FunctionHandler } from "../registry";
import { coerceToBoolean } from "../coerce-boolean";
import { toScalarNumber } from "../numericCoercion";
import { isSpreadsheetErrorValue, type SpreadsheetError } from "../spreadsheet-errors";

type Result = number | SpreadsheetError;

/** The argument at `index` as a number, or the error it evaluated to. */
export const numberArg = (args: string[], context: FunctionContext, index: number): Result =>
  toScalarNumber(context.evaluateFormula(requiredArg(context, args, index)));

/** The argument at `index` read as Excel's truthiness, or the error it evaluated to: coerced
 *  first, an error cell would read as TRUE and the formula answer as if it were fine. */
export function booleanArg(args: string[], context: FunctionContext, index: number): boolean | SpreadsheetError {
  const value = context.evaluateFormula(requiredArg(context, args, index));
  return isSpreadsheetErrorValue(value) ? value : coerceToBoolean(value);
}

/** The arguments as numbers, or the first error among them, in argument order. */
export function numberArgs(args: string[], context: FunctionContext, count: number): number[] | SpreadsheetError {
  const values = Array.from({ length: count }, (_, index) => numberArg(args, context, index));
  const firstError = values.find((value): value is SpreadsheetError => typeof value !== "number");
  return firstError ?? values.filter((value): value is number => typeof value === "number");
}

/** A handler over `count` numeric arguments; `rule` answers #NUM! for what Excel rejects. */
export const numericHandler =
  (count: number, rule: (values: number[]) => Result): FunctionHandler =>
  (args, context) => {
    const values = numberArgs(args, context, count);
    return Array.isArray(values) ? rule(values) : values;
  };

/** Degrees of freedom, truncated as Excel does; below 1 has no distribution. */
export const degreesOfFreedom = (value: number): number | null => {
  const df = Math.trunc(value);
  return df >= 1 ? df : null;
};
