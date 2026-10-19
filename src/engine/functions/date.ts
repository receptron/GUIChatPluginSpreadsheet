/**
 * Date and Time Functions
 * Excel stores dates as sequential serial numbers so they can be used in calculations.
 * Serial 0 is 1899-12-30 on the real calendar, so 1900-01-01 is serial 2 (see date-utils.ts).
 */

import { functionRegistry, requiredArg, toNumber, toString, type FunctionContext, type FunctionHandler } from "../registry";
import { dateArgument } from "../dateText";
import { isSpreadsheetErrorValue, type SpreadsheetError } from "../spreadsheet-errors";
import { computeDatedif } from "../datedif";
import { dateToSerial, serialToDate } from "../date-utils";

const nowHandler: FunctionHandler = () => {
  // Return current date and time as serial number
  // We need to adjust for timezone offset because Excel dates are "local" usually
  // But for simplicity we'll use local time converted to serial
  const now = new Date();
  // Create a UTC date that matches the local time components
  const localAsUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()));
  return dateToSerial(localAsUtc);
};

const todayHandler: FunctionHandler = () => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return dateToSerial(today);
};

const dateHandler: FunctionHandler = (args, context) => {
  const year = toNumber(context.evaluateFormula(requiredArg(context, args, 0)));
  const month = toNumber(context.evaluateFormula(requiredArg(context, args, 1)));
  const day = toNumber(context.evaluateFormula(requiredArg(context, args, 2)));

  // JS Date constructor handles overflow (e.g. month 13 becomes Jan of next year)
  // Month is 0-indexed in JS, 1-indexed in Excel
  const date = new Date(Date.UTC(year, month - 1, day));
  return dateToSerial(date);
};

const timeHandler: FunctionHandler = (args, context) => {
  const hour = toNumber(context.evaluateFormula(requiredArg(context, args, 0)));
  const minute = toNumber(context.evaluateFormula(requiredArg(context, args, 1)));
  const second = toNumber(context.evaluateFormula(requiredArg(context, args, 2)));

  // Time is a fraction of a day
  // 1 hour = 1/24
  // 1 minute = 1/(24*60)
  // 1 second = 1/(24*60*60)

  // Normalize inputs (e.g. 25 hours)
  const totalSeconds = hour * 3600 + minute * 60 + second;
  const secondsPerDay = 86400;

  return (totalSeconds % secondsPerDay) / secondsPerDay;
};

// A date argument is read as Excel reads it: a date written as text (`2025-01`) is that date, and
// other text is #VALUE!, not serial 0.
const serialArg = (args: string[], context: FunctionContext, index: number): number | SpreadsheetError =>
  dateArgument(context.evaluateFormula(requiredArg(context, args, index)), context.preferDDMMYYYY);

const fromSerial =
  (read: (serial: number) => number): FunctionHandler =>
  (args, context) => {
    const serial = serialArg(args, context, 0);
    return isSpreadsheetErrorValue(serial) ? serial : read(serial);
  };

const SECONDS_PER_DAY = 86400;
const secondOfDay = (serial: number): number => Math.round((serial - Math.floor(serial)) * SECONDS_PER_DAY);

const yearHandler = fromSerial((serial) => serialToDate(serial).getUTCFullYear());
const monthHandler = fromSerial((serial) => serialToDate(serial).getUTCMonth() + 1);
const dayHandler = fromSerial((serial) => serialToDate(serial).getUTCDate());
const hourHandler = fromSerial((serial) => Math.floor(secondOfDay(serial) / 3600));
const minuteHandler = fromSerial((serial) => Math.floor((secondOfDay(serial) % 3600) / 60));
const secondHandler = fromSerial((serial) => secondOfDay(serial) % 60);

const datedifHandler: FunctionHandler = (args, context) => {
  const startSerial = serialArg(args, context, 0);
  if (isSpreadsheetErrorValue(startSerial)) return startSerial;
  const endSerial = serialArg(args, context, 1);
  if (isSpreadsheetErrorValue(endSerial)) return endSerial;
  const unit = toString(context.evaluateFormula(requiredArg(context, args, 2)));

  return computeDatedif(startSerial, endSerial, unit);
};

// Register functions
functionRegistry.register({
  name: "NOW",
  handler: nowHandler,
  minArgs: 0,
  maxArgs: 0,
  description: "Returns the serial number of the current date and time",
  examples: ["NOW()"],
  category: "Date & Time",
});

functionRegistry.register({
  name: "TODAY",
  handler: todayHandler,
  minArgs: 0,
  maxArgs: 0,
  description: "Returns the serial number of today's date",
  examples: ["TODAY()"],
  category: "Date & Time",
});

functionRegistry.register({
  name: "DATE",
  handler: dateHandler,
  minArgs: 3,
  maxArgs: 3,
  description: "Returns the serial number that represents a particular date",
  examples: ["DATE(2023, 11, 25)"],
  category: "Date & Time",
});

functionRegistry.register({
  name: "TIME",
  handler: timeHandler,
  minArgs: 3,
  maxArgs: 3,
  description: "Returns the serial number of a particular time",
  examples: ["TIME(14, 30, 0)"],
  category: "Date & Time",
});

functionRegistry.register({
  name: "YEAR",
  handler: yearHandler,
  minArgs: 1,
  maxArgs: 1,
  description: "Converts a serial number to a year",
  examples: ["YEAR(TODAY())", "YEAR(A1)"],
  category: "Date & Time",
});

functionRegistry.register({
  name: "MONTH",
  handler: monthHandler,
  minArgs: 1,
  maxArgs: 1,
  description: "Converts a serial number to a month",
  examples: ["MONTH(TODAY())", "MONTH(A1)"],
  category: "Date & Time",
});

functionRegistry.register({
  name: "DAY",
  handler: dayHandler,
  minArgs: 1,
  maxArgs: 1,
  description: "Converts a serial number to a day of the month",
  examples: ["DAY(TODAY())", "DAY(A1)"],
  category: "Date & Time",
});

functionRegistry.register({
  name: "HOUR",
  handler: hourHandler,
  minArgs: 1,
  maxArgs: 1,
  description: "Converts a serial number to an hour",
  examples: ["HOUR(NOW())", "HOUR(A1)"],
  category: "Date & Time",
});

functionRegistry.register({
  name: "MINUTE",
  handler: minuteHandler,
  minArgs: 1,
  maxArgs: 1,
  description: "Converts a serial number to a minute",
  examples: ["MINUTE(NOW())", "MINUTE(A1)"],
  category: "Date & Time",
});

functionRegistry.register({
  name: "SECOND",
  handler: secondHandler,
  minArgs: 1,
  maxArgs: 1,
  description: "Converts a serial number to a second",
  examples: ["SECOND(NOW())", "SECOND(A1)"],
  category: "Date & Time",
});

functionRegistry.register({
  name: "DATEDIF",
  handler: datedifHandler,
  minArgs: 3,
  maxArgs: 3,
  description: "Calculates the number of days, months, or years between two dates",
  examples: ['DATEDIF(A1, B1, "Y")', 'DATEDIF(DATE(2020,1,1), TODAY(), "D")'],
  category: "Date & Time",
});
