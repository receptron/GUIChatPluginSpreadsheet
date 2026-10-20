/**
 * Names bound by LET and by LAMBDA's parameters, written into a formula's text: each use of a name
 * is replaced by the text that stands for its value, and a call of a LAMBDA (`f(3)`,
 * `LAMBDA(x, x+1)(3)`) by the LAMBDA's body with each parameter replaced by its argument. Text in
 * quotes, sheet names and function names are left alone, and so is a nested LET or LAMBDA that binds
 * the same name again, from the point it does.
 */

import { isEscapedAt } from "./escapes";

const NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const CELL_LIKE = /^[A-Za-z]{1,3}\d+$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.]*/;
const IDENTIFIER_BEFORE = /[A-Za-z0-9_.$!'"]/;

/** Whether `name` may be bound: letters, digits, `_` and `.`, starting with a letter or `_`, and not
 *  a cell reference (`A1`), a logical value, or R or C (which Excel keeps for R1C1 references). */
export const isValidName = (name: string): boolean => NAME.test(name) && !CELL_LIKE.test(name) && !/^(?:true|false|r|c)$/i.test(name);

/** A LAMBDA written as text: its parameter names and its body. */
export interface Lambda {
  params: string[];
  body: string;
}

/** A name and what it stands for: text written in its place, or a LAMBDA, which a call inlines. */
export type Binding = { name: string; text: string } | { name: string; lambda: Lambda };

/** Index just past the quoted text opening at `start` (either quote), honouring `\` escapes. */
function endOfQuoted(text: string, start: number): number {
  const quote = text[start];
  const close = Array.from(text.slice(start + 1)).findIndex((char, offset) => char === quote && !isEscapedAt(text, start + 1 + offset));
  return close === -1 ? text.length : start + close + 2;
}

/** Index just past the bracket that closes the one opening at `start`, skipping quoted text. */
function endOfBracket(text: string, start: number): number {
  const state = { depth: 0, index: start };
  while (state.index < text.length) {
    const char = text[state.index] ?? "";
    if (char === '"' || char === "'") {
      state.index = endOfQuoted(text, state.index);
      continue;
    }
    if (char === "(" || char === "{") state.depth += 1;
    if ((char === ")" || char === "}") && --state.depth === 0) return state.index + 1;
    state.index += 1;
  }
  return text.length;
}

/** `inner` split on its top-level commas, each part trimmed. */
export function splitArguments(inner: string): string[] {
  const commas: number[] = [];
  const state = { index: 0 };
  while (state.index < inner.length) {
    const char = inner[state.index] ?? "";
    if (char === '"' || char === "'") state.index = endOfQuoted(inner, state.index);
    else if (char === "(" || char === "{") state.index = endOfBracket(inner, state.index);
    else {
      if (char === ",") commas.push(state.index);
      state.index += 1;
    }
  }
  const starts = [0, ...commas.map((at) => at + 1)];
  return starts.map((start, index) => inner.slice(start, commas[index] ?? inner.length).trim());
}

/** The LAMBDA `text` is and nothing more, or null. Its parameters must be valid names. */
export function parseLambda(text: string): Lambda | null {
  const trimmed = text.trim();
  const match = /^LAMBDA\s*\(/i.exec(trimmed);
  if (!match) return null;
  const open = match[0].length - 1;
  if (endOfBracket(trimmed, open) !== trimmed.length) return null;
  const parts = splitArguments(trimmed.slice(open + 1, -1));
  const body = parts.at(-1);
  const params = parts.slice(0, -1);
  return body !== undefined && body !== "" && params.every(isValidName) ? { params, body } : null;
}

const sameName = (left: string, right: string): boolean => left.toUpperCase() === right.toUpperCase();

/** A LAMBDA's body with each parameter replaced by the bracketed argument written for it, or null when
 *  the arguments do not match the parameters one for one. */
export function inlinedCall(lambda: Lambda, argumentTexts: string[]): string | null {
  if (argumentTexts.length !== lambda.params.length) return null;
  const bindings = lambda.params.map((name, index): Binding => ({ name, text: `(${argumentTexts[index] ?? ""})` }));
  return `(${substituteNames(lambda.body, bindings)})`;
}

/** The arguments of a nested LET or LAMBDA with `binding` written in, up to where it binds the name again. */
function nestedBindingArguments(callName: string, args: string[], binding: Binding): string[] {
  const isLambda = sameName(callName, "LAMBDA");
  const rebinds = (index: number): boolean => {
    const arg = args[index] ?? "";
    const isNamePosition = isLambda ? index < args.length - 1 : index % 2 === 0 && index < args.length - 1;
    return isNamePosition && sameName(arg, binding.name);
  };
  const firstRebinding = args.findIndex((_, index) => rebinds(index));
  return args.map((arg, index) => {
    const isNamePosition = isLambda ? index < args.length - 1 : index % 2 === 0 && index < args.length - 1;
    // A LET's value for the name it binds again is still read with the outer name; what follows is not.
    const shadowed = firstRebinding !== -1 && index > firstRebinding + (isLambda ? 0 : 1);
    if (isNamePosition || shadowed) return arg;
    return substituteName(arg, binding);
  });
}

/** What replaces a call `name(…)` written at `start`, and where the call ends; null when it is not one to rewrite. */
function rewrittenCall(text: string, start: number, name: string, binding: Binding): { replacement: string; end: number } | null {
  const open = text.indexOf("(", start + name.length);
  const end = endOfBracket(text, open);
  const args = splitArguments(text.slice(open + 1, end - 1));
  if ("lambda" in binding && sameName(name, binding.name)) {
    const inlined = inlinedCall(
      binding.lambda,
      args.map((arg) => substituteName(arg, binding)),
    );
    return inlined === null ? null : { replacement: inlined, end };
  }
  if (sameName(name, "LET") || sameName(name, "LAMBDA")) {
    return { replacement: `${text.slice(start, open + 1)}${nestedBindingArguments(name, args, binding).join(", ")})`, end };
  }
  return null;
}

/** `text` with `binding` written in. */
export function substituteName(text: string, binding: Binding): string {
  const pieces: string[] = [];
  const state = { index: 0 };
  while (state.index < text.length) {
    const char = text[state.index] ?? "";
    const before = text[state.index - 1] ?? "";
    const identifier = IDENTIFIER_BEFORE.test(before) ? undefined : IDENTIFIER.exec(text.slice(state.index))?.[0];
    if (char === '"' || char === "'" || identifier === undefined) {
      const end = char === '"' || char === "'" ? endOfQuoted(text, state.index) : state.index + 1;
      pieces.push(text.slice(state.index, end));
      state.index = end;
      continue;
    }
    const after = text.slice(state.index + identifier.length);
    const isCall = /^\s*\(/.test(after);
    const call = isCall ? rewrittenCall(text, state.index, identifier, binding) : null;
    if (call) {
      pieces.push(call.replacement);
      state.index = call.end;
      continue;
    }
    const isBoundUse = !isCall && !after.startsWith("!") && sameName(identifier, binding.name);
    pieces.push(isBoundUse ? ("lambda" in binding ? `LAMBDA(${[...binding.lambda.params, binding.lambda.body].join(", ")})` : binding.text) : identifier);
    state.index += identifier.length;
  }
  return pieces.join("");
}

/** `text` with each binding written in, the latest first, so a name bound twice takes its latest value. */
export const substituteNames = (text: string, bindings: readonly Binding[]): string =>
  [...bindings].reverse().reduce((written, binding) => substituteName(written, binding), text);

/** Where the first `LAMBDA(…)` written outside quotes starts, from `from`, or -1. */
function nextLambda(text: string, from: number): number {
  const state = { index: from };
  while (state.index < text.length) {
    const char = text[state.index] ?? "";
    if (char === '"' || char === "'") {
      state.index = endOfQuoted(text, state.index);
      continue;
    }
    const startsWord = !IDENTIFIER_BEFORE.test(text[state.index - 1] ?? "");
    if (startsWord && /^LAMBDA\s*\(/i.test(text.slice(state.index))) return state.index;
    state.index += 1;
  }
  return -1;
}

/** `text` with every `LAMBDA(…)(…)` call replaced by the LAMBDA's body over the arguments, or null
 *  when a call's arguments do not match its parameters. A LAMBDA not called is left as written. */
export function inlineLambdaCalls(text: string, from = 0): string | null {
  const start = nextLambda(text, from);
  if (start === -1) return text;
  const open = text.indexOf("(", start);
  const close = endOfBracket(text, open);
  const lambda = parseLambda(text.slice(start, close));
  if (text[close] !== "(" || !lambda) return inlineLambdaCalls(text, open + 1);
  const end = endOfBracket(text, close);
  const inlined = inlinedCall(lambda, splitArguments(text.slice(close + 1, end - 1)));
  return inlined === null ? null : inlineLambdaCalls(text.slice(0, start) + inlined + text.slice(end), start);
}
