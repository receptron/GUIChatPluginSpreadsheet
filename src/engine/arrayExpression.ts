/**
 * Expressions over arrays, decided from the text alone: which operands of a formula are arrays —
 * a range, an array constant (`{1,2;3,4}`), or a call that answers a table — and how operands of
 * different sizes line up. An operand inside a call's arguments belongs to that call (`SUM(A1:A3)`
 * reads its range itself), so only what stands outside every call counts.
 */

import { isEscapedAt } from "./escapes";
import { isSoleRangeReference } from "./spillCandidate";
import { endOfQuotedSheetName, UNQUOTED_SHEET_NAME } from "./sheetReference";
import { isSpreadsheetError, spreadsheetError } from "./spreadsheet-errors";
import type { CellValue } from "./types";

export type ArrayOperandKind = "range" | "constant" | "call";

/** An array operand's place in the formula: `text` is `formula.slice(start, end)`. */
export interface ArrayOperand {
  kind: ArrayOperandKind;
  start: number;
  end: number;
  text: string;
}

/** What the scan needs to know about a name written before "(": whether it is a call at all, and
 *  whether the function may answer a table. */
export interface CallNames {
  isCall: (name: string) => boolean;
  answersTable: (name: string) => boolean;
}

const CALL_START = /^([A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)*)\(/i;
const RANGE_START = new RegExp(String.raw`^(?:${UNQUOTED_SHEET_NAME}!)?[$A-Z0-9]+:[$A-Z0-9]+`, "iu");
const RANGE_BODY = /^[$A-Z0-9]+:[$A-Z0-9]+/i;
const WORD = /^[\p{L}\p{N}_.$]+/u;
const CONTINUES_WORD = /[\p{L}\p{N}_.$(]/u;

/** Index just past the bracket that closes the one opening at `start`, skipping string literals;
 *  the text's length when it never closes. */
function endOfBracket(text: string, start: number, open: string, close: string): number {
  const state = { depth: 0, quote: "" };
  for (let index = start; index < text.length; index++) {
    const char = text[index] ?? "";
    if (state.quote !== "") {
      if (char === state.quote && !isEscapedAt(text, index)) state.quote = "";
    } else if (char === '"' || char === "'") state.quote = char;
    else if (char === open) state.depth += 1;
    else if (char === close && --state.depth === 0) return index + 1;
  }
  return text.length;
}

/** Index just past the string literal opening at `start`. */
const endOfLiteral = (text: string, start: number): number => {
  const quote = text[start];
  const close = Array.from(text.slice(start + 1)).findIndex((char, offset) => char === quote && !isEscapedAt(text, start + 1 + offset));
  return close === -1 ? text.length : start + close + 2;
};

/** The range reference that starts at `start`, or null: `A1:B3`, `$A:$A`, `1:3`, `Data!A1:B3`,
 *  `'My Sheet'!A1:B3`, standing alone (not glued to a following name or bracket). */
function rangeAt(text: string, start: number): string | null {
  const quotedEnd = text[start] === "'" ? endOfQuotedSheetName(text, start) : -1;
  const prefix = quotedEnd !== -1 && text[quotedEnd] === "!" ? text.slice(start, quotedEnd + 1) : "";
  const rest = text.slice(start + prefix.length);
  const match = prefix ? RANGE_BODY.exec(rest) : RANGE_START.exec(rest);
  if (!match) return null;
  const range = prefix + match[0];
  const glued = CONTINUES_WORD.test(text[start + range.length] ?? "");
  return !glued && isSoleRangeReference(range) ? range : null;
}

/** The array operand starting at `start`, or how far to skip when there is none there. */
function operandAt(text: string, start: number, names: CallNames): ArrayOperand | number {
  const char = text[start] ?? "";
  if (char === '"') return endOfLiteral(text, start);
  if (char === "{") return { kind: "constant", start, end: endOfBracket(text, start, "{", "}"), text: "" };
  const range = rangeAt(text, start);
  if (range !== null) return { kind: "range", start, end: start + range.length, text: range };
  if (char === "'") return endOfLiteral(text, start);
  const name = CALL_START.exec(text.slice(start))?.[1];
  if (name !== undefined && names.isCall(name)) {
    const end = endOfBracket(text, start + name.length, "(", ")");
    return names.answersTable(name) ? { kind: "call", start, end, text: "" } : end;
  }
  return start + (WORD.exec(text.slice(start))?.[0].length ?? 1);
}

/** Every array operand of `formula` that stands outside all calls' arguments, in source order. */
export function arrayOperands(formula: string, names: CallNames): ArrayOperand[] {
  const operands: ArrayOperand[] = [];
  const state = { index: 0 };
  while (state.index < formula.length) {
    const found = operandAt(formula, state.index, names);
    if (typeof found === "number") {
      state.index = found;
      continue;
    }
    operands.push({ ...found, text: formula.slice(found.start, found.end) });
    state.index = found.end;
  }
  return operands;
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** One element of an array constant as its value, or null when it is not a constant Excel allows
 *  there (a reference, a call, an expression, nothing). */
function constantElement(written: string): CellValue | null {
  const element = written.trim();
  if (NUMBER.test(element)) return Number(element);
  const closedLiteral = element.length >= 2 && element.startsWith('"') && element.endsWith('"') && endOfLiteral(element, 0) === element.length;
  if (closedLiteral) return element.slice(1, -1);
  if (/^true$/i.test(element)) return true;
  if (/^false$/i.test(element)) return false;
  const code = element.toUpperCase();
  return isSpreadsheetError(code) ? spreadsheetError(code) : null;
}

/** `text` split on `separator` where it stands outside string literals. */
function splitOutsideLiterals(text: string, separator: string): string[] {
  const separators: number[] = [];
  const state = { index: 0 };
  while (state.index < text.length) {
    const char = text[state.index] ?? "";
    if (char === separator) separators.push(state.index);
    state.index = char === '"' ? endOfLiteral(text, state.index) : state.index + 1;
  }
  const starts = [0, ...separators.map((at) => at + 1)];
  return starts.map((start, index) => text.slice(start, separators[index] ?? text.length));
}

/** The rows of an array constant (`{1,2;3,4}`: `,` between columns, `;` between rows), or null
 *  when it is malformed: an element that is not a constant, or rows of different lengths. */
export function parseArrayConstant(constant: string): CellValue[][] | null {
  const body = constant.trim();
  if (!body.startsWith("{") || !body.endsWith("}")) return null;
  const rows = splitOutsideLiterals(body.slice(1, -1), ";").map((row) => splitOutsideLiterals(row, ",").map(constantElement));
  const width = rows[0]?.length ?? 0;
  const values = rows.map((row) => row.filter((value): value is CellValue => value !== null));
  return values.every((row) => row.length === width) ? values : null;
}

export interface TableShape {
  rows: number;
  columns: number;
}

/** The shape operands of these shapes answer together: the largest height and the largest width. */
export const combinedShape = (shapes: readonly TableShape[]): TableShape => ({
  rows: Math.max(1, ...shapes.map((shape) => shape.rows)),
  columns: Math.max(1, ...shapes.map((shape) => shape.columns)),
});

/** Which index of an operand `length` long stands at `index` of the result: a single row or column
 *  repeats, and past the end of a longer one there is nothing (-1, which Excel shows as #N/A). */
export const alignedIndex = (length: number, index: number): number => {
  if (length === 1) return 0;
  return index < length ? index : -1;
};
