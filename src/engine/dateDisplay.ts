/**
 * Whether a formula's number is a date to show as one, when its cell has no format of its own.
 * Excel decides from where the number came from, not from its size: a formula that starts with
 * a date function, or whose first reference is a date, shows a date; a sum that happens to land
 * on 52345 does not. Taking the size alone turned ordinary totals into 2043 dates.
 */

import { findCellRefs } from "./evaluator";
import { isDateFormat } from "./formatter";

// The functions whose answer is a date serial. NOW is left out: it carries a time of day.
const DATE_FUNCTIONS: ReadonlySet<string> = new Set(["DATE", "TODAY", "EDATE", "EOMONTH", "WORKDAY"]);

// A call at the start of the formula, past any opening brackets, signs and spaces.
const LEADING_CALL = /^[\s(+-]*([A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)*)\s*\(/i;

/** What the date decision reads of a referenced cell: its own format, its formula if it has one,
 *  and the sheet that formula's references are read on. */
export interface DateCell {
  format: string;
  formula: string | null;
  sheet: string;
}

/** Looks up a reference (`A1`, `Data!A1`, `'My Sheet'!A1`) written on `sheet`. */
export type DateSource = (ref: string, sheet: string) => DateCell | null;

/** The function a formula body starts with — `DATE` in `DATE(…)+1` or `(DATE(…))` — or null. */
export function leadingCall(body: string): string | null {
  const name = LEADING_CALL.exec(body)?.[1];
  return name === undefined ? null : name.toUpperCase();
}

/** Whether the formula (with its leading `=`), written on `sheet`, shows a date: it starts with a
 *  date function, or its first reference is a date — by its format, or by its own formula. */
export function formulaShowsDate(formula: string, sheet: string, source: DateSource, seen: ReadonlySet<string> = new Set()): boolean {
  const body = formula.replace(/^=/, "");
  const called = leadingCall(body);
  if (called !== null && DATE_FUNCTIONS.has(called)) return true;
  const first = findCellRefs(body)[0]?.ref;
  const cell = first === undefined ? null : source(first, sheet);
  if (cell === null || first === undefined) return false;
  if (isDateFormat(cell.format)) return true;
  const key = `${cell.sheet}!${first.replace(/^.*!/, "").replace(/\$/g, "").toUpperCase()}`;
  if (cell.formula === null || seen.has(key)) return false;
  return formulaShowsDate(cell.formula, cell.sheet, source, new Set([...seen, key]));
}
