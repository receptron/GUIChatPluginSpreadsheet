/**
 * Excel date and time format codes for the TEXT function.
 *
 * Separate from `formatter.formatDate`, which renders CELL display formats with
 * case-sensitive tokens of its own (`mm` is always minutes there): reading those
 * the Excel way would change how stored workbooks display.
 */

import { serialToDate, MONTH_NAMES_SHORT, MONTH_NAMES_FULL, DAY_NAMES_SHORT, DAY_NAMES_FULL, type NameList } from "./date-utils";

type PartKind = "year" | "month" | "day" | "hour" | "minute" | "second";

export type DateToken = { kind: PartKind; width: number } | { kind: "meridiem"; lowercase: boolean } | { kind: "literal"; text: string };

const PART_LETTERS: Record<string, PartKind> = { y: "year", m: "month", d: "day", h: "hour", s: "second" };
const MERIDIEM = "am/pm";
const HOURS_PER_HALF_DAY = 12;
const SHORT_YEAR_DIVISOR = 100;
const FULL_NAME_WIDTH = 4;
const INITIAL_WIDTH = 5;

interface Scan {
  tokens: DateToken[];
  index: number;
}

// `[h]` elapsed time and `[$-409]` locale codes are not rendered.
const UNSUPPORTED_CHARACTER = "[";

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
  if (pattern.slice(scan.index, scan.index + MERIDIEM.length).toLowerCase() === MERIDIEM) {
    scan.tokens.push({ kind: "meridiem", lowercase: char === "a" });
    scan.index += MERIDIEM.length;
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
  scan.tokens.push({ kind: "literal", text: char });
  return scan.index + 1;
};

const isPart = (token: DateToken | undefined, kind: PartKind): boolean => token?.kind === kind;

// Excel reads `m` / `mm` as minutes right after an hour or right before a second,
// with only separators between; anywhere else it is the month.
const resolveMinutes = (tokens: DateToken[]): DateToken[] => {
  const parts = tokens.filter((token) => token.kind !== "literal");
  return tokens.map((token) => {
    if (token.kind !== "month" || token.width > 2) return token;
    const position = parts.indexOf(token);
    const isMinute = isPart(parts[position - 1], "hour") || isPart(parts[position + 1], "second");
    return isMinute ? { kind: "minute", width: token.width } : token;
  });
};

/**
 * Split an Excel date/time format code into tokens, reading its letters
 * case-insensitively. `null` when the code holds no date or time part, or uses
 * a feature this module does not render.
 */
export const parseDatePattern = (pattern: string): DateToken[] | null => {
  if (pattern.includes(UNSUPPORTED_CHARACTER)) return null;
  const scan: Scan = { tokens: [], index: 0 };
  while (scan.index < pattern.length) readToken(pattern, scan);
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

const renderToken = (token: DateToken, date: Date, twelveHour: boolean): string => {
  switch (token.kind) {
    case "literal":
      return token.text;
    case "meridiem": {
      const text = date.getUTCHours() >= HOURS_PER_HALF_DAY ? "PM" : "AM";
      return token.lowercase ? text.toLowerCase() : text;
    }
    case "year":
      return renderYear(date.getUTCFullYear(), token.width);
    case "month":
      return renderMonth(date.getUTCMonth(), token.width);
    case "day":
      return renderDay(date, token.width);
    case "hour":
      return padded(clockHour(date.getUTCHours(), twelveHour), token.width);
    case "minute":
      return padded(date.getUTCMinutes(), token.width);
    case "second":
      return padded(date.getUTCSeconds(), token.width);
  }
};

/** Render a date serial with the tokens `parseDatePattern` read. */
export const renderDatePattern = (serial: number, tokens: DateToken[]): string => {
  const date = serialToDate(serial);
  const twelveHour = tokens.some((token) => token.kind === "meridiem");
  return tokens.map((token) => renderToken(token, date, twelveHour)).join("");
};
