/**
 * Calendar rules for WEEKDAY, DAYS, EDATE, EOMONTH, WORKDAY and NETWORKDAYS, on
 * Excel serial numbers. Pure, so each rule is tested without a sheet. A serial's
 * time of day is dropped first, as Excel does.
 */

import { dateToSerial, serialToDate } from "./date-utils";
import { NUM_ERROR, type SpreadsheetError } from "./spreadsheet-errors";

const DAYS_PER_WEEK = 7;
const SUNDAY = 0;
const SATURDAY = 6;

const wholeDay = (serial: number): number => Math.floor(serial);

const jsWeekday = (serial: number): number => serialToDate(wholeDay(serial)).getUTCDay();

/** The JS weekday (0 = Sunday) that counts as 1, for each WEEKDAY return type. */
const FIRST_DAY_BY_TYPE: Readonly<Record<number, number>> = { 1: 0, 2: 1, 11: 1, 12: 2, 13: 3, 14: 4, 15: 5, 16: 6, 17: 0 };
const ZERO_BASED_MONDAY_TYPE = 3;

/** WEEKDAY: 1–7 counted from the day the return type starts on (type 1, the
 *  default, starts on Sunday); type 3 counts Monday as 0. Any other type is `#NUM!`. */
export function weekdayOf(serial: number, returnType = 1): number | SpreadsheetError {
  const day = jsWeekday(serial);
  if (returnType === ZERO_BASED_MONDAY_TYPE) return (day + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  const first = FIRST_DAY_BY_TYPE[returnType];
  if (first === undefined) return NUM_ERROR;
  return ((day - first + DAYS_PER_WEEK) % DAYS_PER_WEEK) + 1;
}

/** DAYS: whole days from `start` to `end`. */
export const daysBetween = (end: number, start: number): number => wholeDay(end) - wholeDay(start);

const lastDayOfMonth = (year: number, monthIndex: number): number => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/** EDATE: the same day `months` months on, moved back to the month's last day
 *  when the month is shorter (31 January + 1 month is 28 or 29 February). */
export function addMonths(serial: number, months: number): number {
  const date = serialToDate(wholeDay(serial));
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth() + Math.trunc(months);
  const day = Math.min(date.getUTCDate(), lastDayOfMonth(year, monthIndex));
  return dateToSerial(new Date(Date.UTC(year, monthIndex, day)));
}

/** EOMONTH: the last day of the month `months` months on. */
export function endOfMonth(serial: number, months: number): number {
  const date = serialToDate(wholeDay(serial));
  return dateToSerial(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + Math.trunc(months) + 1, 0)));
}

const isWorkday = (serial: number, holidays: ReadonlySet<number>): boolean => {
  const day = jsWeekday(serial);
  return day !== SUNDAY && day !== SATURDAY && !holidays.has(wholeDay(serial));
};

/** WORKDAY: the date `days` working days on (back, when negative), skipping
 *  weekends and `holidays`. Zero days is the start date itself. */
export function addWorkdays(serial: number, days: number, holidays: readonly number[] = []): number {
  const holidaySet = new Set(holidays.map(wholeDay));
  const step = Math.sign(days);
  const state = { date: wholeDay(serial), left: Math.abs(Math.trunc(days)) };
  while (state.left > 0) {
    state.date += step;
    if (isWorkday(state.date, holidaySet)) state.left -= 1;
  }
  return state.date;
}

/** NETWORKDAYS: the working days from `start` to `end`, both included,
 *  negative when `end` comes first. */
export function countWorkdays(start: number, end: number, holidays: readonly number[] = []): number {
  const holidaySet = new Set(holidays.map(wholeDay));
  const [from, to] = start <= end ? [wholeDay(start), wholeDay(end)] : [wholeDay(end), wholeDay(start)];
  const count = Array.from({ length: to - from + 1 }, (_, offset) => from + offset).filter((date) => isWorkday(date, holidaySet)).length;
  return start <= end ? count : -count;
}
