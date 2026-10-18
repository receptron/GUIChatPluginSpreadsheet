/**
 * Calendar functions: WEEKDAY, DAYS, EDATE, EOMONTH, WORKDAY, NETWORKDAYS. The
 * rules live in date-calendar.ts; this file reads the arguments.
 *
 * Arguments are read strictly, as Excel does: a date given as text has already
 * become a serial when the argument is evaluated, so text that is still text is
 * #VALUE!, and an error in an argument is the function's answer.
 */

import { functionRegistry, rawRangeReader, requiredArg, toNumber, type FunctionContext, type FunctionHandler } from "../registry";
import { addMonths, addWorkdays, countWorkdays, daysBetween, endOfMonth, weekdayOf } from "../date-calendar";
import { holdsNumber, toScalarNumber } from "../numericCoercion";
import { isSpreadsheetErrorValue, type SpreadsheetError } from "../spreadsheet-errors";

const numberArg = (args: string[], context: FunctionContext, index: number): number | SpreadsheetError =>
  toScalarNumber(context.evaluateFormula(requiredArg(context, args, index)));

/** The numbers, or the first error among them. */
const numbersOrError = (values: (number | SpreadsheetError)[]): number[] | SpreadsheetError =>
  values.find(isSpreadsheetErrorValue) ?? values.filter((value): value is number => typeof value === "number");

/** The holiday dates in the optional argument at `index`: the numbers of a range
 *  (blanks and text skipped, an error cell is the answer), or one date. */
function holidaysArg(args: string[], context: FunctionContext, index: number): number[] | SpreadsheetError {
  if (args.length <= index) return [];
  const cells = rawRangeReader(context)(requiredArg(context, args, index));
  if (cells.length === 0) return numbersOrError([numberArg(args, context, index)]);
  return cells.find(isSpreadsheetErrorValue) ?? cells.filter(holdsNumber).map(toNumber);
}

const weekdayHandler: FunctionHandler = (args, context) => {
  const values = numbersOrError([numberArg(args, context, 0), args.length > 1 ? numberArg(args, context, 1) : 1]);
  if (isSpreadsheetErrorValue(values)) return values;
  const [serial = 0, returnType = 1] = values;
  return weekdayOf(serial, returnType);
};

const pairHandler =
  (rule: (first: number, second: number) => number | SpreadsheetError): FunctionHandler =>
  (args, context) => {
    const values = numbersOrError([numberArg(args, context, 0), numberArg(args, context, 1)]);
    if (isSpreadsheetErrorValue(values)) return values;
    const [first = 0, second = 0] = values;
    return rule(first, second);
  };

const withHolidays =
  (rule: (first: number, second: number, holidays: number[]) => number | SpreadsheetError): FunctionHandler =>
  (args, context) => {
    const values = numbersOrError([numberArg(args, context, 0), numberArg(args, context, 1)]);
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
    handler: pairHandler(daysBetween),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the number of days between two dates",
    examples: ["DAYS(B2, A2)"],
  },
  {
    name: "EDATE",
    handler: pairHandler(addMonths),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the date a number of months before or after a date",
    examples: ["EDATE(A2, 1)"],
  },
  {
    name: "EOMONTH",
    handler: pairHandler(endOfMonth),
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the last day of the month a number of months away",
    examples: ["EOMONTH(A2, 0)"],
  },
  {
    name: "WORKDAY",
    handler: withHolidays(addWorkdays),
    minArgs: 2,
    maxArgs: 3,
    description: "Returns the date a number of working days away, skipping weekends and holidays",
    examples: ["WORKDAY(A2, 10)", "WORKDAY(A2, 10, H2:H5)"],
  },
  {
    name: "NETWORKDAYS",
    handler: withHolidays(countWorkdays),
    minArgs: 2,
    maxArgs: 3,
    description: "Returns the number of working days between two dates, both included",
    examples: ["NETWORKDAYS(A2, B2)", "NETWORKDAYS(A2, B2, H2:H5)"],
  },
];

CALENDAR_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Date & Time" }));
