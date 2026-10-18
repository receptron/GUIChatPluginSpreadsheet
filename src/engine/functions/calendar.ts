/**
 * Calendar functions: WEEKDAY, DAYS, EDATE, EOMONTH, WORKDAY, NETWORKDAYS. The
 * rules live in date-calendar.ts; this file reads the arguments.
 */

import { functionRegistry, requiredArg, toNumber, type FunctionContext, type FunctionHandler } from "../registry";
import { collectNumericValues } from "./statistical";
import { addMonths, addWorkdays, countWorkdays, daysBetween, endOfMonth, weekdayOf } from "../date-calendar";

const serialArg = (args: string[], context: FunctionContext, index: number): number => toNumber(context.evaluateFormula(requiredArg(context, args, index)));

/** The holiday dates in the optional argument at `index` — a range, or one date — or none. */
const holidaysArg = (args: string[], context: FunctionContext, index: number): number[] =>
  args.length > index ? collectNumericValues([requiredArg(context, args, index)], context) : [];

const weekdayHandler: FunctionHandler = (args, context) => weekdayOf(serialArg(args, context, 0), args.length > 1 ? serialArg(args, context, 1) : 1);
const daysHandler: FunctionHandler = (args, context) => daysBetween(serialArg(args, context, 0), serialArg(args, context, 1));
const edateHandler: FunctionHandler = (args, context) => addMonths(serialArg(args, context, 0), serialArg(args, context, 1));
const eomonthHandler: FunctionHandler = (args, context) => endOfMonth(serialArg(args, context, 0), serialArg(args, context, 1));
const workdayHandler: FunctionHandler = (args, context) => addWorkdays(serialArg(args, context, 0), serialArg(args, context, 1), holidaysArg(args, context, 2));
const networkdaysHandler: FunctionHandler = (args, context) =>
  countWorkdays(serialArg(args, context, 0), serialArg(args, context, 1), holidaysArg(args, context, 2));

const CALENDAR_FUNCTIONS = [
  {
    name: "WEEKDAY",
    handler: weekdayHandler,
    minArgs: 1,
    maxArgs: 2,
    description: "Returns the day of the week (1 = Sunday by default)",
    examples: ["WEEKDAY(A2)", "WEEKDAY(A2, 2)"],
  },
  { name: "DAYS", handler: daysHandler, minArgs: 2, maxArgs: 2, description: "Returns the number of days between two dates", examples: ["DAYS(B2, A2)"] },
  {
    name: "EDATE",
    handler: edateHandler,
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the date a number of months before or after a date",
    examples: ["EDATE(A2, 1)"],
  },
  {
    name: "EOMONTH",
    handler: eomonthHandler,
    minArgs: 2,
    maxArgs: 2,
    description: "Returns the last day of the month a number of months away",
    examples: ["EOMONTH(A2, 0)"],
  },
  {
    name: "WORKDAY",
    handler: workdayHandler,
    minArgs: 2,
    maxArgs: 3,
    description: "Returns the date a number of working days away, skipping weekends and holidays",
    examples: ["WORKDAY(A2, 10)", "WORKDAY(A2, 10, H2:H5)"],
  },
  {
    name: "NETWORKDAYS",
    handler: networkdaysHandler,
    minArgs: 2,
    maxArgs: 3,
    description: "Returns the number of working days between two dates, both included",
    examples: ["NETWORKDAYS(A2, B2)", "NETWORKDAYS(A2, B2, H2:H5)"],
  },
];

CALENDAR_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Date & Time" }));
