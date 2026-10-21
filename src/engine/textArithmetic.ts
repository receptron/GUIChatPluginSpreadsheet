/**
 * Text as an operand of arithmetic, read as Excel reads it: text that is a number is that number
 * (`="3"+1` is 4), and any other text makes the expression #VALUE! (`="a"+1`). In JavaScript `+`
 * would join the text and `*` would give NaN, so `("a"&1)+1` came out "a11" and `0*("a"&1)`
 * #DIV/0!. Text beside `&` or a comparison is left alone: joining and comparing take text.
 */

import { parseNumericString } from "./numericCoercion";
import { VALUE_ERROR, type SpreadsheetError } from "./spreadsheet-errors";

const ARITHMETIC_OPERATORS = "+-*/^";

/** Where the double-quoted literal opening at `start` ends (just past its closing quote), `\`
 *  escapes honoured; the end of the text when it never closes. */
function endOfLiteral(expr: string, start: number): number {
  // UTF-16 units, as every index here is: an emoji in the text must not shift the spans.
  const close = expr
    .slice(start + 1)
    .split("")
    .findIndex((char, offset, chars) => char === '"' && !isEscaped(chars, offset));
  return close === -1 ? expr.length : start + 1 + close + 1;
}

/** Whether the character at `offset` follows an odd run of backslashes. */
function isEscaped(chars: readonly string[], offset: number): boolean {
  const run = chars
    .slice(0, offset)
    .toReversed()
    .findIndex((char) => char !== "\\");
  const backslashes = run === -1 ? offset : run;
  return backslashes % 2 === 1;
}

/** The double-quoted literals of `expr`, as spans. */
function literalSpans(expr: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const scan = { index: 0 };
  while (scan.index < expr.length) {
    if (expr[scan.index] === '"') {
      const end = endOfLiteral(expr, scan.index);
      spans.push({ start: scan.index, end });
      scan.index = end;
    } else scan.index += 1;
  }
  return spans;
}

const isArithmetic = (char: string | undefined): boolean => char !== undefined && ARITHMETIC_OPERATORS.includes(char);

/**
 * `expr` with each literal that stands beside an arithmetic operator replaced by its number, or
 * #VALUE! when one of them is not a number. Every other literal is kept as written.
 */
export function textOperandsAsNumbers(expr: string): string | SpreadsheetError {
  const spans = literalSpans(expr);
  const pieces: string[] = [];
  const cursor = { at: 0 };
  for (const { start, end } of spans) {
    const before = expr.slice(0, start).trimEnd().at(-1);
    const after = expr.slice(end).trimStart()[0];
    if (!isArithmetic(before) && !isArithmetic(after)) continue;
    const text = expr.slice(start + 1, end - 1).replace(/\\(.)/g, "$1");
    const number = parseNumericString(text);
    if (number === null) return VALUE_ERROR;
    pieces.push(expr.slice(cursor.at, start), `(${number})`);
    cursor.at = end;
  }
  pieces.push(expr.slice(cursor.at));
  return pieces.join("");
}
