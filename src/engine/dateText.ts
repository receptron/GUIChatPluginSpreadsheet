/**
 * Text a date function reads as a date. A cell holding `2025-01` or `2025年1月` stays text — what
 * was written, so LEFT, RIGHT and a `"2025-*"` criteria keep working on it — but `YEAR`, `MONTH`
 * and the other functions that take a date read it as one, as Excel does with a date stored as text.
 */

import { parseDate, serialFromParts } from "./date-parser";
import { MONTH_NAMES_FULL, MONTH_NAMES_SHORT } from "./date-utils";
import { toScalarNumber } from "./numericCoercion";
import type { SpreadsheetError } from "./spreadsheet-errors";
import type { CellValue } from "./types";

// A month without a day is that month's first day: `2025-01`, `2025/01`, `Jan 2025`, `2025年1月`.
const FIRST_DAY = 1;
const YEAR_MONTH = /^(\d{4})[-/](\d{1,2})$/;
const NAMED_MONTH_YEAR = /^([A-Za-z]{3,9})\s+(\d{4})$/;
const JAPANESE_DATE = /^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?$/;

const monthNumber = (name: string): number | null => {
  const lower = name.toLowerCase();
  const index = [MONTH_NAMES_SHORT, MONTH_NAMES_FULL].map((names) => names.findIndex((month) => month.toLowerCase() === lower)).find((found) => found >= 0);
  return index === undefined ? null : index + 1;
};

function monthText(text: string): number | null {
  const [, year, month] = text.match(YEAR_MONTH) ?? [];
  if (year !== undefined && month !== undefined) return serialFromParts(Number(year), Number(month), FIRST_DAY);
  const [, name, namedYear] = text.match(NAMED_MONTH_YEAR) ?? [];
  if (name !== undefined && namedYear !== undefined) {
    const named = monthNumber(name);
    return named === null ? null : serialFromParts(Number(namedYear), named, FIRST_DAY);
  }
  const [, jpYear, jpMonth, jpDay] = text.match(JAPANESE_DATE) ?? [];
  if (jpYear === undefined || jpMonth === undefined) return null;
  return serialFromParts(Number(jpYear), Number(jpMonth), jpDay === undefined ? FIRST_DAY : Number(jpDay));
}

/** The serial of a date written as text — every form a cell turns into a date, plus a month alone
 *  and a Japanese date — or null when the text is not one. */
export function dateSerialFromText(text: string, preferDDMMYYYY = false): number | null {
  const trimmed = text.trim();
  return parseDate(trimmed, preferDDMMYYYY) ?? monthText(trimmed);
}

/** A date function's argument: a date written as text is that date; anything else is read as a
 *  number, with text that is neither a date nor a number #VALUE!. */
export function dateArgument(value: CellValue, preferDDMMYYYY = false): number | SpreadsheetError {
  const serial = typeof value === "string" ? dateSerialFromText(value, preferDDMMYYYY) : null;
  return serial ?? toScalarNumber(value);
}
