/**
 * Calendar functions: WEEKDAY, DAYS, EDATE, EOMONTH, WORKDAY, NETWORKDAYS. The
 * rules live in date-calendar.ts; this file reads the arguments.
 *
 * Arguments are read as Excel reads them: a date written as text (`2025-01`) is
 * that date (dateText.ts), other text is #VALUE!, and an error in an argument is
 * the function's answer.
 */

import { functionRegistry, rawRangeReader, requiredArg, toNumber, type FunctionContext, type FunctionHandler } from "../registry";
import { addMonths, addWorkdays, countWorkdays, daysBetween, endOfMonth, weekdayOf } from "../date-calendar";
import { holdsNumber, toScalarNumber } from "../numericCoercion";
import { dateArgument } from "../dateText";
import { isSpreadsheetErrorValue, type SpreadsheetError } from "../spreadsheet-errors";

type ArgumentReader = (args: string[], context: FunctionContext, index: number) => number | SpreadsheetError;

// A date (`2025-01` as text is that date) and a count or a code (`2025-01` there is #VALUE!).
const dateArg: ArgumentReader = (args, context, index) => dateArgument(context.evaluateFormula(requiredArg(context, args, index)), context.preferDDMMYYYY);
const numberArg: ArgumentReader = (args, context, index) => toScalarNumber(context.evaluateFormula(requiredArg(context, args, index)));

/** The numbers, or the first error among them. */
const numbersOrError = (values: (number | SpreadsheetError)[]): number[] | SpreadsheetError =>
  values.find(isSpreadsheetErrorValue) ?? values.filter((value): value is number => typeof value === "number");

/** The holiday dates in the optional argument at `index`: the numbers of a range
 *  (blanks and text skipped, an error cell is the answer), or one date. */
function holidaysArg(args: string[], context: FunctionContext, index: number): number[] | SpreadsheetError {
  if (args.length <= index) return [];
  const cells = rawRangeReader(context)(requiredArg(context, args, index));
  if (cells.length === 0) return numbersOrError([dateArg(args, context, index)]);
  return cells.find(isSpreadsheetErrorValue) ?? cells.filter(holdsNumber).map(toNumber);
}

const weekdayHandler: FunctionHandler = (args, context) => {
  const values = numbersOrError([dateArg(args, context, 0), args.length > 1 ? numberArg(args, context, 1) : 1]);
  if (isSpreadsheetErrorValue(values)) return values;
  const [serial = 0, returnType = 1] = values;
  return weekdayOf(serial, returnType);
};

const pairHandler =
  (rule: (first: number, second: number) => number | SpreadsheetError, readSecond: ArgumentReader): FunctionHandler =>
  (args, context) => {
    const values = numbersOrError([dateArg(args, context, 0), readSecond(args, context, 1)]);
    if (isSpreadsheetErrorValue(values)) return values;
    const [first = 0, second = 0] = values;
    return rule(first, second);
  };

const withHolidays =
  (rule: (first: number, second: number, holidays: number[]) => number | SpreadsheetError, readSecond: ArgumentReader): FunctionHandler =>
  (args, context) => {
    const values = numbersOrError([dateArg(args, context, 0), readSecond(args, context, 1)]);
    if (isSpreadsheetErrorValue(values)) return values;
    const holidays = holidaysArg(args, context, 2);
    if (isSpreadsheetErrorValue(holidays)) return holidays;
    const [first = 0, second = 0] = values;
    return rule(first, second, holidays);
  };

const CALENDAR_FUNCTIONS = [
  {
    name: "WEEKDAY",
    handler: weekdayHandler,
    minArgs: 1,
    maxArgs: 2,
    description: "Returns the day of the week (1 = Sunday by default)",
    examples: ["WEEKDAY(A2)", "WEEKDAY(A2, 2)"],
  },
  {
    name: "DAYS",
    handler: pairHandler(daysBetween, dateArg),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the number of days between two dates",
    examples: ["DAYS(B2, A2)"],
  },
  {
    name: "EDATE",
    handler: pairHandler(addMonths, numberArg),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the date a number of months before or after a date",
    examples: ["EDATE(A2, 1)"],
  },
  {
    name: "EOMONTH",
    handler: pairHandler(endOfMonth, numberArg),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the last day of the month a number of months away",
    examples: ["EOMONTH(A2, 0)"],
  },
  {
    name: "WORKDAY",
    handler: withHolidays(addWorkdays, numberArg),
    minArgs: 2,
    maxArgs: 3,
    description: "Returns the date a number of working days away, skipping weekends and holidays",
    examples: ["WORKDAY(A2, 10)", "WORKDAY(A2, 10, H2:H5)"],
  },
  {
    name: "NETWORKDAYS",
    handler: withHolidays(countWorkdays, dateArg),
    minArgs: 2,
    maxArgs: 3,
    description: "Returns the number of working days between two dates, both included",
    examples: ["NETWORKDAYS(A2, B2)", "NETWORKDAYS(A2, B2, H2:H5)"],
  },
];

CALENDAR_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Date & Time" }));
