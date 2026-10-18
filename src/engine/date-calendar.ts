/**
 * Calendar rules for WEEKDAY, DAYS, EDATE, EOMONTH, WORKDAY and NETWORKDAYS, on
 * Excel serial numbers. Pure, so each rule is tested without a sheet. A serial's
 * time of day is dropped first, as Excel does.
 *
 * Serials follow the engine's own conversion (date-utils.ts: day 0 is 1899-12-30),
 * which agrees with Excel from 1900-03-01 on. Excel's fictitious 1900-02-29 is
 * not reproduced here, as it is not by YEAR, MONTH or DAY.
 */

import { dateToSerial, serialToDate } from "./date-utils";
import { NUM_ERROR, type SpreadsheetError } from "./spreadsheet-errors";

const DAYS_PER_WEEK = 7;
const WORKDAYS_PER_WEEK = 5;
const SUNDAY = 0;
const SATURDAY = 6;
/** The weekday of serial 0, 1899-12-30: a Saturday. */
const WEEKDAY_OF_SERIAL_ZERO = SATURDAY;
/** 9999-12-31, Excel's last date. A result or a span beyond it is #NUM!, which also
 *  keeps WORKDAY's walk and NETWORKDAYS' count bounded. */
export const LAST_SERIAL = 2958465;

const wholeDay = (serial: number): number => Math.floor(serial);

const inDateRange = (serial: number): boolean => Number.isFinite(serial) && serial >= 0 && serial <= LAST_SERIAL;

/** The JS weekday (0 = Sunday) of a serial, by arithmetic rather than a Date. */
const jsWeekday = (serial: number): number => (((wholeDay(serial) + WEEKDAY_OF_SERIAL_ZERO) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK;

/** The JS weekday (0 = Sunday) that counts as 1, for each WEEKDAY return type. */
const FIRST_DAY_BY_TYPE: Readonly<Record<number, number>> = { 1: 0, 2: 1, 11: 1, 12: 2, 13: 3, 14: 4, 15: 5, 16: 6, 17: 0 };
const ZERO_BASED_MONDAY_TYPE = 3;

/** WEEKDAY: 1–7 counted from the day the return type starts on (type 1, the
 *  default, starts on Sunday); type 3 counts Monday as 0. Any other type, or a
 *  serial outside Excel's dates, is `#NUM!`. */
export function weekdayOf(serial: number, returnType = 1): number | SpreadsheetError {
  if (!inDateRange(serial)) return NUM_ERROR;
  const day = jsWeekday(serial);
  if (returnType === ZERO_BASED_MONDAY_TYPE) return (day + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  const first = FIRST_DAY_BY_TYPE[returnType];
  if (first === undefined) return NUM_ERROR;
  return ((day - first + DAYS_PER_WEEK) % DAYS_PER_WEEK) + 1;
}

/** DAYS: whole days from `start` to `end`. */
export function daysBetween(end: number, start: number): number | SpreadsheetError {
  if (!inDateRange(end) || !inDateRange(start)) return NUM_ERROR;
  return wholeDay(end) - wholeDay(start);
}

const lastDayOfMonth = (year: number, monthIndex: number): number => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const withinRange = (serial: number): number | SpreadsheetError => (inDateRange(serial) ? serial : NUM_ERROR);

/** EDATE: the same day `months` months on, moved back to the month's last day
 *  when the month is shorter (31 January + 1 month is 28 or 29 February). */
export function addMonths(serial: number, months: number): number | SpreadsheetError {
  if (!inDateRange(serial) || !Number.isFinite(months)) return NUM_ERROR;
  const date = serialToDate(wholeDay(serial));
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth() + Math.trunc(months);
  const day = Math.min(date.getUTCDate(), lastDayOfMonth(year, monthIndex));
  return withinRange(dateToSerial(new Date(Date.UTC(year, monthIndex, day))));
}

/** EOMONTH: the last day of the month `months` months on. */
export function endOfMonth(serial: number, months: number): number | SpreadsheetError {
  if (!inDateRange(serial) || !Number.isFinite(months)) return NUM_ERROR;
  const date = serialToDate(wholeDay(serial));
  return withinRange(dateToSerial(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + Math.trunc(months) + 1, 0))));
}

const isWeekday = (serial: number): boolean => {
  const day = jsWeekday(serial);
  return day !== SUNDAY && day !== SATURDAY;
};

const holidaySet = (holidays: readonly number[]): ReadonlySet<number> => new Set(holidays.map(wholeDay));

/** WORKDAY: the date `days` working days on (back, when negative), skipping
 *  weekends and `holidays`. Zero days is the start date itself. A walk that leaves
 *  Excel's dates is `#NUM!`, which bounds it. */
export function addWorkdays(serial: number, days: number, holidays: readonly number[] = []): number | SpreadsheetError {
  if (!inDateRange(serial) || !Number.isFinite(days)) return NUM_ERROR;
  const skip = holidaySet(holidays);
  const step = Math.sign(days);
  const state = { date: wholeDay(serial), left: Math.abs(Math.trunc(days)) };
  while (state.left > 0) {
    state.date += step;
    if (!inDateRange(state.date)) return NUM_ERROR;
    if (isWeekday(state.date) && !skip.has(state.date)) state.left -= 1;
  }
  return state.date;
}

/** Monday-to-Friday days from `from` to `to`, both included (`from` <= `to`), by
 *  whole weeks plus the few days left over rather than one day at a time. */
function weekdaysBetween(from: number, to: number): number {
  const days = to - from + 1;
  const fullWeeks = Math.floor(days / DAYS_PER_WEEK);
  const leftOver = Array.from({ length: days % DAYS_PER_WEEK }, (_, offset) => from + fullWeeks * DAYS_PER_WEEK + offset);
  return fullWeeks * WORKDAYS_PER_WEEK + leftOver.filter(isWeekday).length;
}

/** NETWORKDAYS: the working days from `start` to `end`, both included, negative
 *  when `end` comes first. Times of day are dropped before the order is decided;
 *  a holiday counts once, and only when it falls on a weekday in the span. */
export function countWorkdays(start: number, end: number, holidays: readonly number[] = []): number | SpreadsheetError {
  if (!inDateRange(start) || !inDateRange(end)) return NUM_ERROR;
  const [startDay, endDay] = [wholeDay(start), wholeDay(end)];
  const [from, to] = startDay <= endDay ? [startDay, endDay] : [endDay, startDay];
  const holidaysInSpan = [...holidaySet(holidays)].filter((day) => day >= from && day <= to && isWeekday(day)).length;
  const count = weekdaysBetween(from, to) - holidaysInSpan;
  return startDay <= endDay ? count : -count;
}
