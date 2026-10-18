/**
 * Excel-formula → JS-expression translation
 *
 * Pure string transforms that turn the Excel-operator form of an
 * already-substituted expression (cell references resolved, functions replaced)
 * into the JavaScript form handed to `new Function`, plus the character
 * allowlists that gate that evaluation. No engine or evaluator state is
 * captured — every function here is input → output only.
 */

import { isEscapedAt } from "./escapes";

/** Excel `^` exponentiation → JS `**`, with Excel's precedence.
 *
 * JS rejects a unary minus directly before `**` (`-2**2` is a syntax error) and
 * reads `**` right to left. Excel negates first (`-2^2` = 4) and reads `^` left
 * to right (`2^3^2` = 64), so each chain is rebuilt as `((-2)**3)**2`. Text
 * outside a chain, and any `^` inside a string literal, is left as it is. */
export function caretToPow(expr: string): string {
  return renderPowerChains(tokenizeOperators(expr));
}
/** Move the "inside a string literal" marker across one quote character.
 * Empty marker means "not in a literal"; otherwise it holds the opening quote. */
function toggleQuote(openQuote: string, char: string): string {
  if (openQuote === "") return char;
  return char === openQuote ? "" : openQuote;
}

/** Excel `&` string concatenation → JS `+`, leaving any `&` inside a quoted
 *  string literal untouched. A quote toggles the "inside a literal" state only
 *  when it is not backslash-escaped. */
export function replaceConcatOperator(expr: string): string {
  const chars = expr.split("");
  const out: string[] = [];
  let openQuote = "";
  chars.forEach((char, index) => {
    if ((char === '"' || char === "'") && !isEscapedAt(expr, index)) {
      openQuote = toggleQuote(openQuote, char);
    }
    out.push(char === "&" && openQuote === "" ? "+" : char);
  });
  return out.join("");
}

/** Excel `=` equality → JS `==`, without disturbing `<=`, `>=` or `!=`. A single
 *  `=` is rewritten only when flanked by a non-`<>!` char on the left and a
 *  non-`=` on the right.
 *
 * Known limitations, pinned by the tests and tracked separately (#2359): the
 * match consumes both flanking characters so replacements do not overlap
 * (`5=6=7` → `5==6=7`, only the first rewritten); a `=` at either end of the
 * expression has no left/right neighbour and is left alone (`5=` → `5=`); and a
 * hand-typed `==` becomes `===` (its second `=` matches). Excel never emits the
 * last two, so they only bite malformed input. */
export function rewriteComparisonEq(expr: string): string {
  return expr.replace(/([^<>!])=([^=])/g, "$1==$2");
}

/** Whether an expression contains only the characters an arithmetic evaluation
 *  may see: digits, ` + - * / ( ) . ` and spaces. Gates `new Function`. */
export function isSafeArithmetic(expr: string): boolean {
  return /^[\d+\-*/(). ]+$/.test(expr);
}

/** Whether an expression contains only the characters a comparison evaluation
 *  may see: the arithmetic set plus ` < > ! = `. Gates `new Function`. */
export function isSafeComparison(expr: string): boolean {
  return /^[\d+\-*/(). <>!=]+$/.test(expr);
}

interface OperatorToken {
  kind: "literal" | "number" | "word" | "open" | "close" | "caret" | "space" | "symbol";
  text: string;
}

const NUMBER_PATTERN = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const WORD_PATTERN = /^[A-Za-z_$][\w$]*/;
const SPACE_PATTERN = /^\s+/;

/** End index (exclusive) of the string literal opening at `start`, honouring `\` escapes; an unclosed literal runs to the end. */
function literalEnd(expr: string, start: number): number {
  const quote = expr[start];
  const closing = Array.from(expr.slice(start + 1)).findIndex((char, offset) => char === quote && !isEscapedAt(expr, start + 1 + offset));
  return closing === -1 ? expr.length : start + closing + 2;
}

const SINGLE_CHAR_KINDS: Record<string, OperatorToken["kind"]> = { "(": "open", ")": "close", "^": "caret" };

const PATTERNED_KINDS: { kind: OperatorToken["kind"]; pattern: RegExp }[] = [
  { kind: "number", pattern: NUMBER_PATTERN },
  { kind: "word", pattern: WORD_PATTERN },
  { kind: "space", pattern: SPACE_PATTERN },
];

function readToken(expr: string, start: number): OperatorToken {
  const char = expr[start];
  if (char === '"' || char === "'") return { kind: "literal", text: expr.slice(start, literalEnd(expr, start)) };
  const rest = expr.slice(start);
  const patterned = PATTERNED_KINDS.map(({ kind, pattern }) => ({ kind, text: pattern.exec(rest)?.[0] })).find((match) => match.text !== undefined);
  if (patterned?.text !== undefined) return { kind: patterned.kind, text: patterned.text };
  return { kind: SINGLE_CHAR_KINDS[char] ?? "symbol", text: char };
}

/** Split an expression into the tokens operator precedence needs; joining the texts gives the input back. */
export function tokenizeOperators(expr: string): OperatorToken[] {
  const tokens: OperatorToken[] = [];
  const state = { position: 0 };
  while (state.position < expr.length) {
    const token = readToken(expr, state.position);
    tokens.push(token);
    state.position += token.text.length;
  }
  return tokens;
}

interface Operand {
  text: string;
  source: string;
  signed: boolean;
  end: number;
}

const isSign = (token: OperatorToken | undefined): boolean => token?.kind === "symbol" && (token.text === "-" || token.text === "+");

/** Index of the `)` matching the `(` at `open`, or -1 when it is never closed. */
function matchingClose(tokens: OperatorToken[], open: number): number {
  const state = { depth: 0 };
  return tokens.findIndex((token, index) => {
    if (index < open) return false;
    if (token.kind === "open") state.depth += 1;
    if (token.kind === "close") state.depth -= 1;
    return state.depth === 0;
  });
}

/** The atom starting at `start` (a number, literal, word or bracketed group), rendered; null when there is none. */
function readAtom(tokens: OperatorToken[], start: number): { text: string; end: number } | null {
  const token = tokens[start];
  if (token === undefined) return null;
  if (token.kind === "number" || token.kind === "literal" || token.kind === "word") return { text: token.text, end: start + 1 };
  if (token.kind !== "open") return null;
  const close = matchingClose(tokens, start);
  if (close === -1) return null;
  return { text: `(${renderPowerChains(tokens.slice(start + 1, close))})`, end: close + 1 };
}

/** An operand with any unary signs in front of it, as Excel binds them: tighter than `^`. Signs are
 *  joined with spaces because JS reads `--` as decrement; `source` keeps the signs as written. */
function readOperand(tokens: OperatorToken[], start: number): Operand | null {
  const state = { index: start };
  while (isSign(tokens[state.index]) || tokens[state.index]?.kind === "space") state.index += 1;
  const atom = readAtom(tokens, state.index);
  if (atom === null) return null;
  const prefix = tokens.slice(start, state.index);
  const signs = prefix.filter((token) => token.kind === "symbol").map((token) => token.text);
  const writtenPrefix = prefix.map((token) => token.text).join("");
  return { text: signs.join(" ") + atom.text, source: writtenPrefix + atom.text, signed: signs.length > 0, end: atom.end };
}

/** Index of the `^` that continues a chain after `index`, skipping spaces; -1 when the chain ends. */
function nextCaret(tokens: OperatorToken[], index: number): number {
  const state = { index };
  while (tokens[state.index]?.kind === "space") state.index += 1;
  return tokens[state.index]?.kind === "caret" ? state.index : -1;
}

const powerOperand = (operand: Operand): string => (operand.signed ? `(${operand.text})` : operand.text);

/** Fold `base ^ e1 ^ e2 …` from `first` left to right; returns the rendered chain and where it ends. */
function readPowerChain(tokens: OperatorToken[], first: Operand): { text: string; end: number } {
  const chain = { text: powerOperand(first), end: first.end, links: 0 };
  for (let caret = nextCaret(tokens, chain.end); caret !== -1; caret = nextCaret(tokens, chain.end)) {
    const exponent = readOperand(tokens, caret + 1);
    if (exponent === null) break;
    const base = chain.links === 0 ? chain.text : `(${chain.text})`;
    Object.assign(chain, { text: `${base}**${powerOperand(exponent)}`, end: exponent.end, links: chain.links + 1 });
  }
  return chain.links === 0 ? { text: first.source, end: first.end } : chain;
}

/** Whether a token after `previous` (the last non-space token) starts an operand: a sign there is unary. */
const startsOperand = (previous: OperatorToken | undefined): boolean =>
  previous === undefined || previous.kind === "open" || previous.kind === "symbol" || previous.kind === "caret";

/** Whether an operand may be read from `token`: a space never starts one, and a sign only where it is unary. */
const mayStartOperand = (token: OperatorToken, previous: OperatorToken | undefined): boolean =>
  token.kind !== "space" && (!isSign(token) || startsOperand(previous));

/** Rebuild every `^` chain, leaving everything outside a chain as it was written. */
function renderPowerChains(tokens: OperatorToken[]): string {
  const out: string[] = [];
  const state: { index: number; previous: OperatorToken | undefined } = { index: 0, previous: undefined };
  while (state.index < tokens.length) {
    const token = tokens[state.index];
    const operand = mayStartOperand(token, state.previous) ? readOperand(tokens, state.index) : null;
    const chain = operand === null ? null : readPowerChain(tokens, operand);
    out.push(chain === null ? (token.kind === "caret" ? "**" : token.text) : chain.text);
    const end = chain === null ? state.index + 1 : chain.end;
    if (token.kind !== "space") state.previous = tokens[end - 1];
    state.index = end;
  }
  return out.join("");
}
