/**
 * Numeric coercion helpers for the spreadsheet engine.
 *
 * Two intentionally different reads share one string parser (`parseNumericString`):
 *  - `registry.toNumber` — lenient, for range aggregation (SUM / AVERAGE / …):
 *    anything unreadable becomes 0. PINNED (booleans are 0, not Excel's 1/0).
 *  - `toScalarNumber` — strict, for single-value math functions (ABS / SIGN):
 *    booleans are 1/0 and non-numeric text is `#VALUE!`, matching Excel.
 *
 * `holdsNumber` asks the question neither read can answer once it has coerced:
 * was there a number here at all, or is this 0 the reading of something else.
 */

import type { CellValue } from "./types";
import { VALUE_ERROR, type SpreadsheetError } from "./spreadsheet-errors";

// A number written plainly (`-1.5`, `.5`, `2e3`), or with thousands separators in threes (`1,200`).
const PLAIN_NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const GROUPED_NUMBER = /^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d*)?$/;
// A percentage (`25%`, `1,200 %`) and a currency amount (`$1,000`, `-$5`): the sign may sit outside the `$`.
const PERCENTAGE = /^(.*?)\s*%$/;
const CURRENCY = /^([-+]?)\$(.*)$/;

const finiteOrNull = (num: number): number | null => (Number.isFinite(num) ? num : null);

const wholeNumber = (text: string): number | null => {
  if (PLAIN_NUMBER.test(text)) return finiteOrNull(Number(text));
  return GROUPED_NUMBER.test(text) ? finiteOrNull(Number(text.replace(/,/g, ""))) : null;
};

/**
 * Parse a spreadsheet string as a number, or `null` when it holds no number.
 *
 * The WHOLE text must be the number — a percentage, a currency amount, a thousands-separated value
 * or a plain one, as Excel reads what is typed into a cell. Text that merely starts with one
 * (`2023-01`, `12abc`, `5% off`) or holds a comma (`Tokyo, Japan`) is text, not its leading digits.
 */
export function parseNumericString(value: string): number | null {
  const text = value.trim();
  const [, percentage] = text.match(PERCENTAGE) ?? [];
  if (percentage !== undefined) {
    const num = wholeNumber(percentage);
    return num === null ? null : num / 100;
  }
  const [, sign, amount] = text.match(CURRENCY) ?? [];
  if (amount !== undefined) {
    const num = sign !== "" && /^[-+]/.test(amount) ? null : wholeNumber(amount.trim());
    return num === null ? null : sign === "-" ? -num : num;
  }
  return wholeNumber(text);
}

/**
 * Whether a value holds a number at all, under the same reading `toNumber` uses.
 *
 * `toNumber` answers 0 for text, for a boolean and for a genuine 0 alike, so a
 * caller that must tell "no number here" from "the number zero" — COUNT — cannot
 * ask it. Booleans are not numbers here, matching `toNumber`'s PINNED behaviour.
 */
export function holdsNumber(value: CellValue): boolean {
  if (typeof value === "number") return !isNaN(value);
  if (typeof value !== "string") return false;
  return parseNumericString(value) !== null;
}

/**
 * Strict scalar coercion for single-value math functions (ABS, SIGN). Follows
 * Excel's scalar rules: a boolean is 1 / 0 and genuinely non-numeric text is
 * `#VALUE!` rather than a silent 0 — including text that only starts with a number.
 */
export function toScalarNumber(value: CellValue): number | SpreadsheetError {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value !== "string") return value;
  return parseNumericString(value) ?? VALUE_ERROR;
}

/**
 * Whether a calculated cell value counts as a number in a range read by SUM, AVERAGE or COUNT:
 * a number, or text that is entirely a number. A logical value and an empty string — what a
 * formula like `=IF(…,"",…)` leaves — are not, as in Excel.
 */
export function isRangeNumber(value: CellValue): boolean {
  if (typeof value === "number") return !isNaN(value);
  return typeof value === "string" && parseNumericString(value) !== null;
}
