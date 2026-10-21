/**
 * FORECAST.ETS, FORECAST.ETS.CONFINT and FORECAST.ETS.SEASONALITY: values over a timeline, read as
 * pairs (a blank value is a missing point), made a series one step apart and fitted with additive
 * Holt-Winters. The rules live in forecast-ets-math.ts.
 */

import { holdsNumber } from "../numericCoercion";
import { functionRegistry, requiredArg, toNumber, type FunctionContext, type FunctionHandler } from "../registry";
import { isSpreadsheetErrorValue, NA_ERROR, NUM_ERROR, VALUE_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import type { CellValue } from "../types";
import { normalQuantile } from "./distribution-math";
import {
  aggregationOf,
  LAST_AGGREGATION,
  MAX_SEASONALITY,
  detectedSeasonality,
  fitHoltWinters,
  forecastAt,
  intervalAt,
  regularSeries,
  type EtsFit,
  type RegularSeries,
  type TimedValue,
} from "./forecast-ets-math";
import { numberArg, optionalNumberArg } from "./table-args";

const AUTO_SEASONALITY = 1;
const DEFAULT_CONFIDENCE = 0.95;
const FIT_CACHE_SIZE = 32;

const cellsOf = (arg: string, context: FunctionContext): CellValue[] =>
  (context.getRangeGrid ? context.getRangeGrid(arg) : [[context.evaluateFormula(arg)]]).flat();

/** One pair: a blank value is left out (a missing point); a blank or non-number time, or a value that
 *  is not a number, is #VALUE!, and an error cell is that error. */
function pairOf(value: CellValue, time: CellValue): TimedValue | null | SpreadsheetError {
  if (isSpreadsheetErrorValue(time)) return time;
  if (isSpreadsheetErrorValue(value)) return value;
  if (!holdsNumber(time)) return VALUE_ERROR;
  if (value === "") return null;
  return holdsNumber(value) ? { time: toNumber(time), value: toNumber(value) } : VALUE_ERROR;
}

/** The values and the timeline as pairs; #N/A when they are not the same size. */
function pairsArg(args: string[], context: FunctionContext, at: number): TimedValue[] | SpreadsheetError {
  const values = cellsOf(requiredArg(context, args, at), context);
  const times = cellsOf(requiredArg(context, args, at + 1), context);
  if (values.length !== times.length) return NA_ERROR;
  const pairs = values.map((value, index) => pairOf(value, times[index] ?? ""));
  const error = pairs.find(isSpreadsheetErrorValue);
  if (error) return error;
  return pairs.filter((pair): pair is TimedValue => pair !== null && !isSpreadsheetErrorValue(pair));
}

/** A whole-number option from `low` to `high`, `fallback` when left out; #NUM! otherwise. */
function optionArg(args: string[], context: FunctionContext, index: number, fallback: number, high: number): number | SpreadsheetError {
  const value = optionalNumberArg(args, context, index, fallback);
  if (isSpreadsheetErrorValue(value)) return value;
  return Number.isInteger(value) && value >= 0 && value <= high ? value : NUM_ERROR;
}

/** The series the values and timeline at `at` make, by data_completion and aggregation at `optionsAt`. */
function seriesArg(args: string[], context: FunctionContext, at: number, optionsAt: number): RegularSeries | SpreadsheetError {
  const pairs = pairsArg(args, context, at);
  if (isSpreadsheetErrorValue(pairs)) return pairs;
  const completion = optionArg(args, context, optionsAt, 1, 1);
  if (isSpreadsheetErrorValue(completion)) return completion;
  const aggregation = optionArg(args, context, optionsAt + 1, 0, LAST_AGGREGATION);
  if (isSpreadsheetErrorValue(aggregation)) return aggregation;
  return regularSeries(pairs, aggregationOf(aggregation), completion === 0);
}

// A column of forecasts over one series would fit the same model in every cell; fitting is the slow part.
const fitCache = new Map<string, EtsFit | SpreadsheetError>();

function cachedFit(values: readonly number[], period: number): EtsFit | SpreadsheetError {
  const key = `${period}|${values.join(",")}`;
  const known = fitCache.get(key);
  if (known) return known;
  const fit = fitHoltWinters(values, period);
  if (fitCache.size >= FIT_CACHE_SIZE) fitCache.delete(fitCache.keys().next().value ?? "");
  fitCache.set(key, fit);
  return fit;
}

/** The fit and how many steps past the last time the target is, for a call whose seasonality is at
 *  `seasonalityAt` and its other options after it. #NUM! for a target before the last time. */
function forecastArgs(args: string[], context: FunctionContext, seasonalityAt: number): { fit: EtsFit; steps: number } | SpreadsheetError {
  const target = numberArg(args, context, 0);
  if (isSpreadsheetErrorValue(target)) return target;
  const series = seriesArg(args, context, 1, seasonalityAt + 1);
  if (isSpreadsheetErrorValue(series)) return series;
  const seasonality = optionArg(args, context, seasonalityAt, AUTO_SEASONALITY, MAX_SEASONALITY);
  if (isSpreadsheetErrorValue(seasonality)) return seasonality;
  if (target < series.lastTime) return NUM_ERROR;
  const fit = cachedFit(series.values, seasonality === AUTO_SEASONALITY ? detectedSeasonality(series.values) : seasonality);
  return isSpreadsheetErrorValue(fit) ? fit : { fit, steps: (target - series.lastTime) / series.step };
}

const forecastEtsHandler: FunctionHandler = (args, context) => {
  const forecast = forecastArgs(args, context, 3);
  return isSpreadsheetErrorValue(forecast) ? forecast : forecastAt(forecast.fit, forecast.steps);
};

const confintHandler: FunctionHandler = (args, context) => {
  const confidence = optionalNumberArg(args, context, 3, DEFAULT_CONFIDENCE);
  if (isSpreadsheetErrorValue(confidence)) return confidence;
  if (!(confidence > 0 && confidence < 1)) return NUM_ERROR;
  const forecast = forecastArgs(args, context, 4);
  return isSpreadsheetErrorValue(forecast) ? forecast : intervalAt(forecast.fit, forecast.steps, normalQuantile((1 + confidence) / 2));
};

const seasonalityHandler: FunctionHandler = (args, context) => {
  const series = seriesArg(args, context, 0, 2);
  return isSpreadsheetErrorValue(series) ? series : detectedSeasonality(series.values);
};

const SERIES_ARGS = "values over a timeline with a constant step";

const FORECAST_ETS_FUNCTIONS = [
  {
    name: "FORECAST.ETS",
    handler: forecastEtsHandler,
    minArgs: 3,
    maxArgs: 6,
    description: `Returns the forecast at target_date of ${SERIES_ARGS}, by additive Holt-Winters (seasonality 1 detects it, 0 has none; values can differ from Excel's)`,
    examples: ["FORECAST.ETS(A50, B2:B49, A2:A49)", "FORECAST.ETS(A50, B2:B49, A2:A49, 12)"],
  },
  {
    name: "FORECAST.ETS.CONFINT",
    handler: confintHandler,
    minArgs: 3,
    maxArgs: 7,
    description: `Returns the half-width of the confidence interval (95% unless given) around FORECAST.ETS's forecast at target_date of ${SERIES_ARGS}`,
    examples: ["FORECAST.ETS.CONFINT(A50, B2:B49, A2:A49)", "FORECAST.ETS.CONFINT(A50, B2:B49, A2:A49, 0.9, 12)"],
  },
  {
    name: "FORECAST.ETS.SEASONALITY",
    handler: seasonalityHandler,
    minArgs: 2,
    maxArgs: 4,
    description: `Returns the season's length FORECAST.ETS detects in ${SERIES_ARGS} (0 when there is none)`,
    examples: ["FORECAST.ETS.SEASONALITY(B2:B49, A2:A49)"],
  },
];

FORECAST_ETS_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Statistical" }));
