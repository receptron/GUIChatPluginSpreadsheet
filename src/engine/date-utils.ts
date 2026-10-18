/**
 * Date Utility Functions
 *
 * Shared utilities for converting between JavaScript Date objects and Excel serial numbers.
 * Excel stores dates as sequential serial numbers so they can be used in calculations.
 *
 * Serial 0 is 1899-12-30 and the calendar is the real one, as in LibreOffice and Google
 * Sheets: Excel's serial 60 is a 1900-02-29 that never existed, so its serials 1–59 sit
 * one day later than these. From 1900-03-01 (serial 61) on, the two agree.
 */

// Constants
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Two days before 1900-01-01, so serials from 1900-03-01 on match Excel's without its phantom leap day.
const EXCEL_BASE_DATE = new Date(Date.UTC(1899, 11, 30));

/**
 * Convert JavaScript Date to Excel Serial Number
 *
 * @param date - JavaScript Date object
 * @returns Excel serial number (days since Dec 30, 1899)
 */
export const dateToSerial = (date: Date): number => {
  const diff = date.getTime() - EXCEL_BASE_DATE.getTime();
  return diff / MS_PER_DAY;
};

/**
 * Convert Excel Serial Number to JavaScript Date
 *
 * @param serial - Excel serial number
 * @returns JavaScript Date object
 */
export const serialToDate = (serial: number): Date => {
  const days = Math.floor(serial);
  const timePart = serial - days;

  const date = new Date(EXCEL_BASE_DATE.getTime() + days * MS_PER_DAY);

  // Add time component
  const totalSeconds = Math.round(timePart * 24 * 60 * 60);
  date.setSeconds(date.getSeconds() + totalSeconds);

  return date;
};

/** A name list that always has a first entry, so a formatter can fall back to it
 *  when a date is unreadable and its month/weekday index comes out NaN. */
export type NameList = readonly [string, ...string[]];

/**
 * Month names for formatting
 */
export const MONTH_NAMES_SHORT: NameList = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MONTH_NAMES_FULL: NameList = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Day names for formatting
 */
export const DAY_NAMES_SHORT: NameList = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DAY_NAMES_FULL: NameList = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
