/**
 * Excel date and time format codes, read as Excel reads them. Used by the TEXT
 * function and by a cell's display format.
 */

import { serialToDate, MONTH_NAMES_SHORT, MONTH_NAMES_FULL, DAY_NAMES_SHORT, DAY_NAMES_FULL, type NameList } from "./date-utils";
import { LAST_SERIAL } from "./date-calendar";

type PartKind = "year" | "month" | "day" | "hour" | "minute" | "second";

export type DateToken = { kind: PartKind; width: number } | { kind: "meridiem"; lowercase: boolean; letterOnly: boolean } | { kind: "literal"; text: string };

const PART_LETTERS: Record<string, PartKind> = { y: "year", m: "month", d: "day", h: "hour", s: "second" };
const MERIDIEMS = ["am/pm", "a/p"];
const HOURS_PER_HALF_DAY = 12;
const SHORT_YEAR_DIVISOR = 100;
const FULL_NAME_WIDTH = 4;
const INITIAL_WIDTH = 5;

interface Scan {
  tokens: DateToken[];
  index: number;
  declined: boolean;
}

// `[h]` elapsed time and `[$-409]` locale codes are not rendered.
const UNSUPPORTED_CHARACTER = "[";
// An unquoted `0` or `#` makes it a number code (`0.00 d`, `$#,##0 USD`), whose
// letters are text; that also declines fractional seconds (`ss.0`). An unquoted
// Latin letter that is no date part (`Standard`, the era codes `e`, `g`, `b`) is
// not a code this reads either.
const DECLINED_CHARACTER = /^[0#A-Za-z]$/;

const runLength = (pattern: string, start: number, letter: string): number => {
  const rest = Array.from(pattern.slice(start).toLowerCase());
  const end = rest.findIndex((char) => char !== letter);
  return end === -1 ? rest.length : end;
};

/** Read the token starting at `scan.index` and move past it. */
const readToken = (pattern: string, scan: Scan): void => {
  const char = pattern[scan.index] ?? "";
  const letter = char.toLowerCase();
  const part = PART_LETTERS[letter];
  const meridiem = MERIDIEMS.find((code) => pattern.slice(scan.index, scan.index + code.length).toLowerCase() === code);
  if (meridiem) {
    scan.tokens.push({ kind: "meridiem", lowercase: char === "a", letterOnly: meridiem.length < MERIDIEMS[0].length });
    scan.index += meridiem.length;
  } else if (part) {
    const width = runLength(pattern, scan.index, letter);
    scan.tokens.push({ kind: part, width });
    scan.index += width;
  } else {
    scan.index = readLiteral(pattern, scan);
  }
};

/** A `"quoted"` run, a `\`-escaped character, or one plain character. Returns the next index. */
const readLiteral = (pattern: string, scan: Scan): number => {
  const char = pattern[scan.index] ?? "";
  if (char === '"') {
    const close = pattern.indexOf('"', scan.index + 1);
    const end = close === -1 ? pattern.length : close;
    scan.tokens.push({ kind: "literal", text: pattern.slice(scan.index + 1, end) });
    return end + 1;
  }
  if (char === "\\") {
    scan.tokens.push({ kind: "literal", text: pattern[scan.index + 1] ?? "" });
    return scan.index + 2;
  }
  if (DECLINED_CHARACTER.test(char)) scan.declined = true;
  scan.tokens.push({ kind: "literal", text: char });
  return scan.index + 1;
};

/** The nearest date or time part from `start` stepping by `step`, past any text. */
const neighbour = (tokens: DateToken[], start: number, step: number): DateToken | undefined => {
  const rest = step < 0 ? tokens.slice(0, start + 1).toReversed() : tokens.slice(start);
  return rest.find((token) => token.kind !== "literal");
};

// Excel reads `m` / `mm` as minutes when the part before it is an hour or the
// part after it a second, whatever text stands between: its own Japanese time
// format `h"時"mm"分"` shows minutes. Anywhere else it is the month.
const resolveMinutes = (tokens: DateToken[]): DateToken[] =>
  tokens.map((token, index) => {
    if (token.kind !== "month" || token.width > 2) return token;
    const isMinute = neighbour(tokens, index - 1, -1)?.kind === "hour" || neighbour(tokens, index + 1, 1)?.kind === "second";
    return isMinute ? { kind: "minute", width: token.width } : token;
  });

/**
 * Split an Excel date/time format code into tokens, reading its letters
 * case-insensitively. `null` when the code holds no date or time part, or uses
 * a feature this module does not render.
 */
export const parseDatePattern = (pattern: string): DateToken[] | null => {
  if (pattern.includes(UNSUPPORTED_CHARACTER)) return null;
  const scan: Scan = { tokens: [], index: 0, declined: false };
  while (scan.index < pattern.length) readToken(pattern, scan);
  if (scan.declined) return null;
  const tokens = resolveMinutes(scan.tokens);
  return tokens.some((token) => token.kind !== "literal") ? tokens : null;
};

const padded = (value: number, width: number): string => value.toString().padStart(Math.min(width, 2), "0");

const named = (names: NameList, index: number, width: number): string => {
  const name = names[index] ?? names[0];
  return width >= INITIAL_WIDTH ? name.charAt(0) : name;
};

const renderYear = (year: number, width: number): string => (width > 2 ? year.toString() : padded(year % SHORT_YEAR_DIVISOR, 2));

const renderMonth = (month: number, width: number): string => {
  if (width < 3) return padded(month + 1, width);
  return named(width >= FULL_NAME_WIDTH ? MONTH_NAMES_FULL : MONTH_NAMES_SHORT, month, width);
};

const renderDay = (date: Date, width: number): string => {
  if (width < 3) return padded(date.getUTCDate(), width);
  return (width >= FULL_NAME_WIDTH ? DAY_NAMES_FULL : DAY_NAMES_SHORT)[date.getUTCDay()] ?? DAY_NAMES_FULL[0];
};

const clockHour = (hours: number, twelveHour: boolean): number => (twelveHour ? hours % HOURS_PER_HALF_DAY || HOURS_PER_HALF_DAY : hours);

const PART_RENDERERS: Record<PartKind, (date: Date, width: number, twelveHour: boolean) => string> = {
  year: (date, width) => renderYear(date.getUTCFullYear(), width),
  month: (date, width) => renderMonth(date.getUTCMonth(), width),
  day: renderDay,
  hour: (date, width, twelveHour) => padded(clockHour(date.getUTCHours(), twelveHour), width),
  minute: (date, width) => padded(date.getUTCMinutes(), width),
  second: (date, width) => padded(date.getUTCSeconds(), width),
};

const renderMeridiem = (date: Date, lowercase: boolean, letterOnly: boolean): string => {
  const text = date.getUTCHours() >= HOURS_PER_HALF_DAY ? "PM" : "AM";
  const shown = letterOnly ? text.charAt(0) : text;
  return lowercase ? shown.toLowerCase() : shown;
};

const renderToken = (token: DateToken, date: Date, twelveHour: boolean): string => {
  if (token.kind === "literal") return token.text;
  if (token.kind === "meridiem") return renderMeridiem(date, token.lowercase, token.letterOnly);
  return PART_RENDERERS[token.kind](date, token.width, twelveHour);
};

const SECONDS_PER_DAY = 24 * 60 * 60;

/** Whether `serial` falls on a date Excel has, once its time is rounded to the
 *  second as `serialToDate` does (9999-12-31 23:59:59.9 is the next day). */
export const isRenderableSerial = (serial: number): boolean => {
  const days = Math.floor(serial);
  const roundedSeconds = Math.round((serial - days) * SECONDS_PER_DAY);
  return days >= 0 && days + roundedSeconds / SECONDS_PER_DAY < LAST_SERIAL + 1;
};

/** Render a date serial with the tokens `parseDatePattern` read. */
export const renderDatePattern = (serial: number, tokens: DateToken[]): string => {
  const date = serialToDate(serial);
  const twelveHour = tokens.some((token) => token.kind === "meridiem");
  return tokens.map((token) => renderToken(token, date, twelveHour)).join("");
};
