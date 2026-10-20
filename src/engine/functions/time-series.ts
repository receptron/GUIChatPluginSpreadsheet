/**
 * AUTOCORREL, EMA and DECOMPOSE: time series read as one row or one column of numbers, in order, each
 * cell read as TREND and LINEST read theirs (text that is a number counts). A blank, or text that is
 * not a number, would shift every value after it, so it is #VALUE! rather than skipped, and an error
 * cell is that error. An answer of a value per point keeps the series' direction. The rules
 * live in time-series-math.ts.
 */

import { holdsNumber } from "../numericCoercion";
import { functionRegistry, requiredArg, toNumber, type FunctionContext, type FunctionHandler } from "../registry";
import { isSpreadsheetErrorValue, VALUE_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import type { CellValue, FormulaValue } from "../types";
import { autocorrelation, decomposition, exponentialAverage, type DecompositionModel } from "./time-series-math";
import { numberArg } from "./table-args";

interface Series {
  values: number[];
  /** Read from one row, so an answer per point is a row too. */
  isRow: boolean;
}

/** The series an argument holds: one row or one column of numbers. */
function seriesArg(args: string[], context: FunctionContext, index: number): Series | SpreadsheetError {
  const arg = requiredArg(context, args, index);
  const grid: CellValue[][] = context.getRangeGrid ? context.getRangeGrid(arg) : [[context.evaluateFormula(arg)]];
  const isRow = grid.length === 1;
  if (!isRow && !grid.every((row) => row.length === 1)) return VALUE_ERROR;
  const cells = grid.flat();
  const error = cells.find(isSpreadsheetErrorValue);
  if (error) return error;
  return cells.every(holdsNumber) ? { values: cells.map(toNumber), isRow } : VALUE_ERROR;
}

/** Values per point laid out as the series was: a row, or a column. */
const alongSeries = (series: Series, values: CellValue[]): FormulaValue => (series.isRow ? [values] : values.map((value) => [value]));

const autocorrelHandler: FunctionHandler = (args, context) => {
  const series = seriesArg(args, context, 0);
  if (isSpreadsheetErrorValue(series)) return series;
  const lag = numberArg(args, context, 1);
  return typeof lag === "number" ? autocorrelation(series.values, lag) : lag;
};

const emaHandler: FunctionHandler = (args, context) => {
  const series = seriesArg(args, context, 0);
  if (isSpreadsheetErrorValue(series)) return series;
  const alpha = numberArg(args, context, 1);
  if (typeof alpha !== "number") return alpha;
  const averages = exponentialAverage(series.values, alpha);
  return isSpreadsheetErrorValue(averages) ? averages : alongSeries(series, averages);
};

/** DECOMPOSE's model: "additive" (the default) or "multiplicative", in any case; anything else #VALUE!. */
function modelArg(args: string[], context: FunctionContext): DecompositionModel | SpreadsheetError {
  const arg = args[2]?.trim() ?? "";
  if (arg === "") return "additive";
  const value = context.evaluateFormula(arg);
  if (isSpreadsheetErrorValue(value)) return value;
  const name = typeof value === "string" ? value.toLowerCase() : "";
  return name === "additive" || name === "multiplicative" ? name : VALUE_ERROR;
}

// DECOMPOSE(values, period, [model]): a row per point of trend, seasonal and residual (for a series
// in a row, a column per point).
const decomposeHandler: FunctionHandler = (args, context) => {
  const series = seriesArg(args, context, 0);
  if (isSpreadsheetErrorValue(series)) return series;
  const period = numberArg(args, context, 1);
  if (typeof period !== "number") return period;
  const model = modelArg(args, context);
  if (isSpreadsheetErrorValue(model)) return model;
  const parts = decomposition(series.values, period, model);
  if (isSpreadsheetErrorValue(parts) || !series.isRow) return parts;
  return [0, 1, 2].map((part) => parts.map((row) => row[part] ?? VALUE_ERROR));
};

const TIME_SERIES_FUNCTIONS = [
  {
    name: "AUTOCORREL",
    handler: autocorrelHandler,
    minArgs: 2,
    maxArgs: 2,
    description: "Returns a series' autocorrelation at a lag, as statsmodels' acf computes it (not an Excel function)",
    examples: ["AUTOCORREL(B2:B100, 1)", "AUTOCORREL(B2:B100, 12)"],
    spills: false,
  },
  {
    name: "EMA",
    handler: emaHandler,
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the exponential moving average of a series with smoothing alpha in (0, 1], one value per point; spills (not an Excel function)",
    examples: ["EMA(B2:B100, 0.3)"],
    spills: true,
  },
  {
    name: "DECOMPOSE",
    handler: decomposeHandler,
    minArgs: 2,
    maxArgs: 3,
    description:
      'Splits a series into trend, seasonal and residual parts over a period (additive or "multiplicative"), as statsmodels\' seasonal_decompose does; spills a row per point for a column of values, a column per point for a row (not an Excel function)',
    examples: ["DECOMPOSE(B2:B49, 12)", 'DECOMPOSE(B2:B49, 12, "multiplicative")'],
    spills: true,
  },
];

TIME_SERIES_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Statistical" }));
