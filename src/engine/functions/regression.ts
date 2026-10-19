/**
 * Regression and covariance functions: FORECAST.LINEAR, TREND at one new x, STEYX,
 * COVARIANCE.S/.P. The rules live in regression-math.ts; this file reads the arguments.
 */

import { blankAwareRangeReader, functionRegistry, requiredArg, toNumber, type FunctionContext, type FunctionHandler } from "../registry";
import { collectArgumentValues } from "./statistical";
import { pairedHandler, pairsFrom, scalarArg } from "./statistical-analysis";
import { defaultKnownXs, forecastLinear, populationCovariance, sampleCovariance, standardErrorOfEstimate, trendAt } from "./regression-math";
import { coerceToBoolean } from "../coerce-boolean";
import { holdsNumber, toScalarNumber } from "../numericCoercion";
import { isSpreadsheetErrorValue, VALUE_ERROR, type SpreadsheetError } from "../spreadsheet-errors";

const forecastHandler: FunctionHandler = (args, context) => {
  const x = scalarArg(args, context, 0);
  if (typeof x !== "number") return x;
  const pairs = pairsFrom(args, context, 1);
  return "ys" in pairs ? forecastLinear(pairs, x) : pairs;
};

/** TREND's new_x: one value. A range of several cells asks for an array, which a cell cannot hold. */
function singleNewX(arg: string, context: FunctionContext): number | SpreadsheetError {
  const [only, ...rest] = collectArgumentValues([arg], context, blankAwareRangeReader(context));
  if (only === undefined || rest.length > 0) return VALUE_ERROR;
  if (only.isScalar) return toScalarNumber(only.value);
  if (isSpreadsheetErrorValue(only.value)) return only.value;
  return holdsNumber(only.value) ? toNumber(only.value) : VALUE_ERROR;
}

/** TREND's const: TRUE unless given; an error passes through. */
function withConstantArg(args: string[], context: FunctionContext): boolean | SpreadsheetError {
  const arg = args[3]?.trim();
  if (!arg) return true;
  const value = context.evaluateFormula(arg);
  return isSpreadsheetErrorValue(value) ? value : coerceToBoolean(value);
}

const trendHandler: FunctionHandler = (args, context) => {
  const readRaw = blankAwareRangeReader(context);
  const knownYs = readRaw(requiredArg(context, args, 0));
  const knownXArg = args[1]?.trim();
  const knownXs = knownXArg ? readRaw(knownXArg) : defaultKnownXs(knownYs.length);
  const newX = singleNewX(requiredArg(context, args, 2), context);
  if (typeof newX !== "number") return newX;
  const withConstant = withConstantArg(args, context);
  return typeof withConstant === "boolean" ? trendAt(knownYs, knownXs, newX, withConstant) : withConstant;
};

const REGRESSION_FUNCTIONS = [
  {
    name: "FORECAST.LINEAR",
    handler: forecastHandler,
    minArgs: 3,
    maxArgs: 3,
    description: "Returns the value of the least-squares line through known_y and known_x at x",
    examples: ["FORECAST.LINEAR(30, B2:B20, A2:A20)"],
  },
  {
    name: "TREND",
    handler: trendHandler,
    minArgs: 3,
    maxArgs: 4,
    description: "Returns the least-squares line's value at one new x (known_x defaults to 1, 2, 3, …; const FALSE fits through the origin)",
    examples: ["TREND(B2:B20, A2:A20, 30)", "TREND(B2:B20, , 21)"],
  },
  {
    name: "STEYX",
    handler: pairedHandler(standardErrorOfEstimate),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the standard error of the y predicted by the least-squares line",
    examples: ["STEYX(B2:B20, A2:A20)"],
  },
  {
    name: "COVARIANCE.P",
    handler: pairedHandler(populationCovariance),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the population covariance of two ranges",
    examples: ["COVARIANCE.P(A2:A20, B2:B20)"],
  },
  {
    name: "COVARIANCE.S",
    handler: pairedHandler(sampleCovariance),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the sample covariance of two ranges",
    examples: ["COVARIANCE.S(A2:A20, B2:B20)"],
  },
];

REGRESSION_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Statistical" }));
