/**
 * Excel `&` with Excel's precedence.
 *
 * `&` binds looser than `+ - * / ^`, so `"a"&1+2` is `"a"&(1+2)` = `a3`. Rewriting
 * `&` to JS `+` in place made it bind as tightly as `+` and evaluate left to
 * right: `"a"+1+2` is `a12`. Here each `&` operand is parenthesised before the
 * join, so its arithmetic runs first, and the join starts from `""` so it is a
 * string concatenation whatever the operands are (`5&6` is `56`, not 11).
 */

import { isEscapedAt } from "./escapes";
import { replaceConcatOperator } from "./translateFormula";

export interface Place {
  char: string;
  inLiteral: boolean;
  /** Paren nesting outside literals; a `(` or `)` counts at its outer level. */
  depth: number;
}

const isQuote = (char: string): boolean => char === '"' || char === "'";

/** Each character with whether it sits in a string literal and how deeply it is nested. */
export function placesOf(expr: string): Place[] {
  const state = { quote: "", depth: 0 };
  // UTF-16 units, not code points: every index here is handed to slice() and
  // isEscapedAt(), which count units, so an emoji before `&` must not shift them.
  return expr.split("").map((char, index) => {
    const opensOrCloses = isQuote(char) && !isEscapedAt(expr, index) && (state.quote === "" || state.quote === char);
    const inLiteral = state.quote !== "" || opensOrCloses;
    if (opensOrCloses) state.quote = state.quote === "" ? char : "";
    if (!inLiteral && char === ")") state.depth -= 1;
    const place = { char, inLiteral, depth: state.depth };
    if (!inLiteral && char === "(") state.depth += 1;
    return place;
  });
}

const isOperator = (place: Place, chars: string): boolean => !place.inLiteral && chars.includes(place.char);

/** The pieces of `expr` between top-level `&`s. */
function topLevelOperands(expr: string): string[] {
  const places = placesOf(expr);
  const cuts = places.flatMap((place, index) => (place.depth === 0 && isOperator(place, "&") ? [index] : []));
  return [-1, ...cuts].map((cut, index) => expr.slice(cut + 1, cuts[index] ?? expr.length));
}

/** The text rebuilt so far, and where in the source it stopped. */
interface Assembly {
  pieces: string[];
  cursor: number;
}

/** Where each top-level `( … )` group of `expr` opens and closes. */
function topLevelGroups(expr: string): { open: number; close: number }[] {
  const places = placesOf(expr);
  const opens = places.flatMap((place, index) => (place.depth === 0 && isOperator(place, "(") ? [index] : []));
  const closeOf = (open: number): number => places.findIndex((place, index) => index > open && place.depth === 0 && isOperator(place, ")"));
  return opens.map((open) => ({ open, close: closeOf(open) })).filter(({ close }) => close > 0);
}

/** `expr` with the inside of every top-level `( … )` group translated too. */
function translateGroups(expr: string): string {
  const groups = topLevelGroups(expr);
  const start: Assembly = { pieces: [], cursor: 0 };
  const { pieces, cursor } = groups.reduce<Assembly>(
    (built, { open, close }) => ({
      pieces: [...built.pieces, expr.slice(built.cursor, open + 1), translate(expr.slice(open + 1, close))],
      cursor: close,
    }),
    start,
  );
  return [...pieces, expr.slice(cursor)].join("");
}

// A boolean cell reaches here as a bare `true` / `false` (renderOperand); joined
// as text, Excel writes it TRUE / FALSE.
const BOOLEAN_TEXT: Readonly<Record<string, string>> = { true: '"TRUE"', false: '"FALSE"' };

/** `operand` without the parentheses that wrap all of it: `((true))` → `true`. */
function unwrapped(operand: string): string {
  const trimmed = operand.trim();
  const places = placesOf(trimmed);
  const wrapsAll =
    trimmed.startsWith("(") && places.findIndex((place, index) => index > 0 && place.depth === 0 && isOperator(place, ")")) === trimmed.length - 1;
  return wrapsAll ? unwrapped(trimmed.slice(1, -1)) : trimmed;
}

// A function result or a cell can arrive wrapped, `(true)`, so the wrapper is
// looked through before deciding the operand is a boolean.
const asConcatOperand = (operand: string): string => BOOLEAN_TEXT[unwrapped(operand)] ?? operand;

function translate(expr: string): string {
  const operands = topLevelOperands(expr).map(translateGroups);
  if (operands.length === 1) return operands[0] ?? "";
  return `(""+${operands.map((operand) => `(${asConcatOperand(operand)})`).join("+")})`;
}

/**
 * Excel `&` → a JS expression that concatenates with Excel's precedence.
 *
 * Returns the plain in-place rewrite when the expression compares (`=`, `<`, `>`
 * outside a literal) or an operand is empty (a leading or trailing `&`). The
 * evaluator's concatenation gate rejects that rewrite, so those formulas come out
 * exactly as they did before: comparing a joined string needs text comparison,
 * which the evaluator does not have, and treating `&` as `+` there would answer
 * `=A1&B1=3` TRUE where Excel compares "12" with 3.
 */
export function concatToSum(expr: string): string {
  const places = placesOf(expr);
  if (places.some((place) => isOperator(place, "=<>"))) return replaceConcatOperator(expr);
  const operands = topLevelOperands(expr);
  if (operands.length > 1 && operands.some((operand) => operand.trim() === "")) return replaceConcatOperator(expr);
  return translate(expr);
}

/** Every operand of every `&` in `expr`, nested groups included, so the evaluator
 *  can check each one the way it checks an expression without `&`: joined as text,
 *  `1/0` would read "Infinity" where Excel answers #DIV/0!. */
export function concatOperands(expr: string): string[] {
  const operands = topLevelOperands(expr);
  const nested = operands.flatMap((operand) => topLevelGroups(operand).flatMap(({ open, close }) => concatOperands(operand.slice(open + 1, close))));
  return operands.length > 1 ? [...operands, ...nested] : nested;
}
