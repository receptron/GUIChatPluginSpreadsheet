/**
 * The text of an expression: a value written as an operand, string literals, cell references and
 * a call's arguments, read without evaluating anything.
 */

import type { CellValue } from "./types";
import { endOfQuotedSheetName, UNQUOTED_SHEET_NAME } from "./sheetReference";
import { isEscapedAt } from "./escapes";
import { isSpreadsheetErrorValue } from "./spreadsheet-errors";

/** Render a cell's value as the text that stands in for it inside an
 *  expression. Strings are quoted so they cannot be read as identifiers or
 *  operators, and their own quotes and backslashes are escaped so the literal
 *  cannot be closed early. A missing value becomes 0, matching how blanks are
 *  treated everywhere else in the engine. */
export function renderOperand(value: CellValue | null | undefined): string {
  if (value === null || value === undefined) return "0";
  const text = isSpreadsheetErrorValue(value) ? value.code : value;
  if (typeof text === "string") return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return text.toString();
}

/** Replace every quoted string literal with an empty pair of quotes, honouring
 *  `\` escapes so an escaped quote does not end the literal early. Used to
 *  validate the STRUCTURE of a concat/arithmetic expression without letting the
 *  arbitrary CONTENT of a string decide whether the whole thing looks safe. */
export function maskStringLiterals(expr: string): string {
  let out = "";
  let quote: string | null = null;
  for (let index = 0; index < expr.length; index++) {
    const char = expr[index];
    if (quote !== null) {
      if (char === "\\") {
        index++; // skip the escaped character — it is part of the literal
        continue;
      }
      if (char === quote) {
        quote = null;
        out += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      out += char;
      continue;
    }
    out += char;
  }
  return out;
}

/** Whether a `&`-to-`+` concatenation expression is safe to evaluate. Checks the
 *  structure with string CONTENT masked out — a string literal may hold any
 *  character (a `!`, a `\`), and validating those against a character allowlist
 *  rejected valid formulas like `=A1&"!"` and every escaped operand. Once the
 *  literals are masked, only the joining structure remains to validate. */
export function isSafeConcatExpression(expr: string): boolean {
  // A boolean cell renders as a bare `true` / `false` here (renderOperand) —
  // the only non-literal identifier the substitution can emit. Drop those words
  // before validating so a boolean operand (`=A1&"!"` with A1 = true) still
  // evaluates, while any other identifier keeps the structure from matching and
  // never reaches `new Function`.
  const structure = maskStringLiterals(expr).replace(/\b(?:true|false)\b/g, "");
  return /^[\d+\-*/(). "']*$/.test(structure);
}

/** Index just past the string literal that opens at `start` (a quote char),
 *  honouring `\` escapes so an escaped quote does not close it early. Returns
 *  `expr.length` when the literal is never closed. */
export function endOfStringLiteral(expr: string, start: number): number {
  const quote = expr[start];
  let index = start + 1;
  while (index < expr.length) {
    if (expr[index] === "\\") {
      index += 2; // skip the escaped character — it is part of the literal
      continue;
    }
    if (expr[index] === quote) return index + 1;
    index++;
  }
  return expr.length;
}

/** A `'Sheet Name'!A1` reference beginning at `start` (a `'`), or null when the
 *  quotes open a plain string literal rather than a sheet-qualified reference. */
function matchQuotedSheetRef(expr: string, start: number): string | null {
  const afterName = endOfQuotedSheetName(expr, start);
  if (afterName === -1 || expr[afterName] !== "!") return null;
  const cellPart = expr.substring(afterName + 1).match(/^(\$?[A-Z]+\$?\d+)/);
  if (!cellPart) return null;
  return expr.substring(start, afterName + 1 + cellPart[0].length);
}

const UNQUOTED_SHEET_PREFIX = new RegExp(String.raw`^(${UNQUOTED_SHEET_NAME})!`, "u");

/** A `Sheet!A1` or bare `A1` / `$A$1` reference beginning at `start`, or null. */
function matchUnquotedRef(expr: string, start: number): string | null {
  const rest = expr.substring(start);
  const sheetMatch = rest.match(UNQUOTED_SHEET_PREFIX);
  if (sheetMatch) {
    const cellPart = rest.substring(sheetMatch[0].length).match(/^(\$?[A-Z]+\$?\d+)/);
    if (cellPart) return sheetMatch[0] + cellPart[0];
  }
  const cellMatch = rest.match(/^(\$?[A-Z]+\$?\d+)/);
  return cellMatch ? cellMatch[0] : null;
}

/** Every cell reference in an expression, as `{ref, start}` spans in source
 *  order. Quoted string literals are skipped whole: a `"A1"` in the text is a
 *  constant, not a reference, and substituting it would turn `="A1"&"!"` into
 *  A1's value. A `'` opens either a `'Sheet'!A1` reference or a string literal —
 *  only the former is a reference; the latter is skipped like a `"` literal. */
export interface CellRefSpan {
  ref: string;
  start: number;
}

export function findCellRefs(expr: string): CellRefSpan[] {
  const cellRefs: CellRefSpan[] = [];
  let i = 0;
  while (i < expr.length) {
    const char = expr[i];
    if (char === '"') {
      i = endOfStringLiteral(expr, i);
      continue;
    }
    if (char === "'") {
      const sheetRef = matchQuotedSheetRef(expr, i);
      if (sheetRef) {
        cellRefs.push({ ref: sheetRef, start: i });
        i += sheetRef.length;
      } else {
        i = endOfStringLiteral(expr, i);
      }
      continue;
    }
    const ref = matchUnquotedRef(expr, i);
    if (ref) {
      cellRefs.push({ ref, start: i });
      i += ref.length;
      continue;
    }
    i++;
  }
  return cellRefs;
}

/** Replace every reference span in `expr` with the text `render` gives for it,
 *  walking BACK TO FRONT so the spans ahead of each edit stay valid. A global
 *  string replace rewrote every occurrence of the shorter reference first, so
 *  `=A1+A10` had its `A10` broken into `<A1's value>0` and produced a plausible
 *  wrong number (#2357). */
export function substituteCellRefs(expr: string, cellRefs: CellRefSpan[], render: (ref: string, start: number) => string): string {
  return cellRefs.toReversed().reduce((text, { ref, start }) => text.slice(0, start) + render(ref, start) + text.slice(start + ref.length), expr);
}

/**
 * Parse function arguments, handling nested functions and quoted strings
 *
 * @param argsStr - String containing function arguments
 * @returns Array of argument strings
 */
export function parseFunctionArgs(argsStr: string): string[] {
  const args: string[] = [];
  let currentArg = "";
  let depth = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];
    // Handle string boundaries
    if ((char === '"' || char === "'") && !isEscapedAt(argsStr, i)) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
      currentArg += char;
      continue;
    }

    // Track bracket depth (nested calls, and an array constant's own commas)
    if (!inString) {
      if (char === "(" || char === "{") depth++;
      if (char === ")" || char === "}") depth--;

      // Split on comma only at depth 0 and not in string
      if (char === "," && depth === 0) {
        args.push(currentArg.trim());
        currentArg = "";
        continue;
      }
    }

    currentArg += char;
  }

  if (currentArg.trim()) {
    args.push(currentArg.trim());
  }

  return args;
}
