/**
 * Spreadsheet Function Registry
 *
 * This module provides a registry system for spreadsheet functions,
 * allowing modular organization and easy extension of formula capabilities.
 */

import type { CellValue, FormulaValue } from "./types";
import { holdsNumber, parseNumericString } from "./numericCoercion";
import { parseDate } from "./date-parser";
import { isSpreadsheetErrorValue, type SpreadsheetError } from "./spreadsheet-errors";
import { isSoleReference } from "./spillCandidate";
import { arrayOperands, type CallNames } from "./arrayExpression";
export type { CellValue };
export type CellGetter = (ref: string) => CellValue;
export type RangeGetter = (range: string) => CellValue[];
export type RawRangeGetter = (range: string) => CellValue[];

export interface FunctionContext {
  /** The registry name the formula invoked, so a handler can report a failure
   *  the way the evaluator names it. */
  functionName: string;
  getCellValue: CellGetter;
  getRangeValues: RangeGetter;
  getRangeValuesRaw?: RawRangeGetter | undefined;
  getRangeValuesKeepingBlanks?: RawRangeGetter | undefined;
  /** How many cells of a range hold something, a formula's "" included (COUNTA). */
  countFilledCells?: ((range: string) => number) | undefined;
  evaluateFormula: (formula: string) => CellValue;
  /** An argument's value, a table included where `evaluateFormula` stands it for one value. */
  evaluateValue?: ((formula: string) => FormulaValue) | undefined;
  /** A reference's cells row by row, a blank one as "", or the table a call answers. */
  getRangeGrid?: ((range: string) => CellValue[][]) | undefined;
  /** Whether an argument is nothing but a reference to a blank cell, which evaluating reads as 0. */
  isBlankReference?: ((arg: string) => boolean) | undefined;
  /** Read an ambiguous `01/02/2020` as day-first, as the sheet's own dates are. */
  preferDDMMYYYY?: boolean | undefined;
  /** The cell whose formula is being calculated, 0-based; absent outside a sheet (`ROW()`). */
  currentCell?: CellCoordinates | undefined;
  /** The name of the sheet that cell is on. */
  currentSheet?: string | undefined;
}

export interface CellCoordinates {
  row: number;
  col: number;
}

/** The too-few-arguments error, raised by the evaluator from the registry's
 *  `minArgs` before any handler runs — and by `requiredArg` for the argument a
 *  handler actually reads, so both report one wording. */
export const tooFewArgumentsError = (funcName: string, minArgs: number): Error =>
  new Error(`${funcName} requires at least ${minArgs} argument${minArgs !== 1 ? "s" : ""}`);

/** The argument at `index`, which the caller has already established is there —
 *  the registry's `minArgs` for a mandatory argument, an `args.length` branch for
 *  an optional one. An absent one means that guarantee is wrong, so it raises the
 *  arity error the guarantee should have raised. Never a default value: a
 *  substituted 0 or "" computes a plausible wrong answer, which is worse than
 *  the error the formula deserves. */
export const requiredArg = (context: FunctionContext, args: string[], index: number): string => {
  const arg = args[index];
  if (arg === undefined) throw tooFewArgumentsError(context.functionName, index + 1);
  return arg;
};

/** The range reader that keeps every cell, for functions whose answer depends on
 *  a range's POSITIONS rather than its numbers.
 *
 *  `getRangeValues` drops non-numeric cells, which silently renumbers the rows
 *  underneath: a criteria/value pair read that way falls out of alignment and
 *  aggregates a different row, and an index returned from it points at the wrong
 *  one. SUMIF/AVERAGEIF were moved here in #2358; MATCH/XLOOKUP in #2765.
 *
 *  Falls back to the numeric reader because `getRangeValuesRaw` is optional on
 *  `FunctionContext` — a host that predates it keeps its old behaviour rather
 *  than throwing. */
export const rawRangeReader = (context: FunctionContext): RangeGetter => context.getRangeValuesRaw ?? context.getRangeValues;

/** The positional reader with a blank cell read as "" rather than 0, for the functions that
 *  must tell a blank from a stored 0: a criteria (`"<2"` does not match a blank), a pairing
 *  (CORREL drops a row with a blank side), COUNTA. Lookups keep `rawRangeReader`, where a
 *  blank reads as 0 the way Excel's INDEX returns it. */
export const blankAwareRangeReader = (context: FunctionContext): RangeGetter => context.getRangeValuesKeepingBlanks ?? rawRangeReader(context);

export type FunctionHandler = (args: string[], context: FunctionContext) => FormulaValue;

export interface FunctionDefinition {
  name: string;
  handler: FunctionHandler;
  minArgs?: number;
  maxArgs?: number;
  description?: string;
  examples?: string[];
  category?: string;
  /** May answer a table, which spills from the formula's cell when the call is the whole formula.
   *  Only such a function's result spills; any other answering a table is #VALUE!. */
  spills?: boolean;
  /** Written by the engine itself, never by a formula's author: left out of the documented list. */
  internal?: boolean;
}

class FunctionRegistry {
  private functions = new Map<string, FunctionDefinition>();
  // A workbook's own functions, visible only while that workbook is being calculated. The
  // registry is one for the whole app, and two open workbooks must not see each other's.
  private overlay: ReadonlyMap<string, FunctionDefinition> | null = null;

  register(def: FunctionDefinition): void {
    this.functions.set(def.name.toUpperCase(), def);
  }

  get(name: string): FunctionDefinition | undefined {
    const key = name.toUpperCase();
    return this.functions.get(key) ?? this.overlay?.get(key);
  }

  hasFunction(name: string): boolean {
    const key = name.toUpperCase();
    return this.functions.has(key) || (this.overlay?.has(key) ?? false);
  }

  /** Whether `name` is one of the engine's own functions, which a workbook may not redefine. */
  isBuiltIn(name: string): boolean {
    return this.functions.has(name.toUpperCase());
  }

  /** Run `calculate` with `functions` (keyed by upper-case name) visible as well. Only for a
   *  synchronous calculation: nothing else can run between setting the overlay and taking it off. */
  withOverlay<T>(functions: ReadonlyMap<string, FunctionDefinition>, calculate: () => T): T {
    const previous = this.overlay;
    this.overlay = functions;
    try {
      return calculate();
    } finally {
      this.overlay = previous;
    }
  }

  getAllFunctions(): FunctionDefinition[] {
    return Array.from(this.functions.values());
  }

  getFunctionsByCategory(): Map<string, FunctionDefinition[]> {
    const categories = new Map<string, FunctionDefinition[]>();

    for (const func of Array.from(this.functions.values()).filter((definition) => definition.internal !== true)) {
      const category = func.category || "Other";
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(func);
    }

    return categories;
  }
}

export const functionRegistry = new FunctionRegistry();

/** How a scan of a formula's text tells calls, and calls that may answer a table, from other names. */
export const CALL_NAMES: CallNames = {
  isCall: (name) => isCallableName(name),
  answersTable: (name) => functionRegistry.get(name)?.spills === true,
};

/** Whether `text` is a formula that may answer a table and is not a reference: a call to a
 *  function that may answer one (`SORT(A1:A9)`), an array constant, or an expression over arrays
 *  (`A1:A9*2`). An argument read as a range is then read as that table's cells (`SUM(A1:A9*2)`). */
export function answersTable(text: string): boolean {
  return !isSoleReference(text) && arrayOperands(text, CALL_NAMES).length > 0;
}

/** Whether `name` written before "(" is a function call. A letters-only name is,
 *  registered or not (an unknown one reports #NAME?). A name with digits is only
 *  when registered: LOG10 is also shaped like a cell reference, so `A1(2)` is not. */
/** A function name as a formula spells it: letters and digits, with `.`-joined
 *  parts for the names current Excel uses (`PERCENTILE.INC`, `STDEV.S`). A part may
 *  start with a digit (`T.DIST.2T`). Used as a regex SOURCE by every place that
 *  looks for a call. */
export const FUNCTION_NAME_SOURCE = "[A-Z][A-Z0-9]*(?:\\.[A-Z0-9]+)*";

export const isCallableName = (name: string): boolean => /^[A-Z]+(?:\.[A-Z]+)*$/i.test(name) || functionRegistry.hasFunction(name);

/**
 * Lenient numeric coercion for range aggregation: anything unreadable is 0.
 * PINNED behaviour (booleans are 0, not Excel's 1/0) — the string parsing lives
 * in numericCoercion.parseNumericString, shared with the strict scalar read.
 */
export function toNumber(value: CellValue): number {
  if (typeof value === "number") return value;
  return parseNumericString(String(value)) ?? 0;
}

/** A value as text, as Excel writes it: a logical value is TRUE or FALSE. */
export function toString(value: CellValue): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

const REGEXP_METACHARACTERS = /[.*+?^${}()|[\]\\]/;

const escapeRegExpChar = (char: string): string => (REGEXP_METACHARACTERS.test(char) ? `\\${char}` : char);

// One criteria token: `~x` (an escaped character) or any single character. The
// escape branch needs a following character, so a TRAILING `~` falls through to
// the single-character branch and stands for itself.
const CRITERIA_TOKEN = /~([\s\S])|[\s\S]/g;

const criteriaRegexSource = (pattern: string): string =>
  pattern.replace(CRITERIA_TOKEN, (token, escaped: string | undefined) => {
    if (escaped !== undefined) return escapeRegExpChar(escaped);
    if (token === "*") return ".*";
    if (token === "?") return ".";
    return escapeRegExpChar(token);
  });

/**
 * Match text the way a spreadsheet criteria does: case-insensitively, with `*`
 * standing for any run of characters, `?` for exactly one, and `~` escaping the
 * next character. A plain `String(v) === criteria` missed both — `COUNTIF(range,
 * "yes")` skipped a cell holding `Yes`, and `"A*"` was compared literally.
 */
function textMatcher(pattern: string): (text: string) => boolean {
  const regex = new RegExp(`^${criteriaRegexSource(pattern)}$`, "iu");
  return (text) => regex.test(text);
}

/**
 * Helper to parse criteria for conditional functions like COUNTIF, SUMIF
 * Returns a comparison function that tests if a value matches the criteria
 */
export function parseCriteria(criteria: string, preferDDMMYYYY = false): (value: CellValue) => boolean {
  // The criteria is the value its argument evaluated to, compared as written: its spaces and quotes
  // are part of it (`" x"` does not match `x`).
  // A bare `=` matches a blank cell and a bare `<>` any cell that is not blank.
  if (criteria === "=") return (v) => String(v) === "";
  if (criteria === "<>") return (v) => String(v) !== "";

  // Check for comparison operators
  // eslint-disable -- sonarjs/slow-regex
  const [, op, value] = criteria.match(/^([><=!]+)(.+)$/) ?? [];
  if (op !== undefined && value !== undefined) {
    // The number after an operator may stand apart from it (`">= 5"`).
    const numValue = criteriaNumber(value.trim(), preferDDMMYYYY);

    // `=` / `<>` compare like the bare criteria does — case-insensitive text
    // with wildcards, or the number. `<>` is exactly its negation.
    const equals = matchesTextOrNumber(value, preferDDMMYYYY);
    // An ordering compares numbers only: Excel's `"<2"` matches neither a blank nor text,
    // which toNumber would both read as 0.
    const ordered = (test: (n: number) => boolean) => (v: CellValue) => holdsNumber(v) && test(toNumber(v));
    switch (op) {
      case ">":
        return ordered((n) => n > numValue);
      case ">=":
        return ordered((n) => n >= numValue);
      case "<":
        return ordered((n) => n < numValue);
      case "<=":
        return ordered((n) => n <= numValue);
      case "=":
      case "==":
        return equals;
      case "!=":
      case "<>":
        return (v) => !equals(v);
      default:
        return () => false;
    }
  }

  return matchesTextOrNumber(criteria, preferDDMMYYYY);
}

/** The number a criteria compares against: a date's serial (cells hold dates as serials), else
 *  the number the text holds, read the way a cell's is (`"5%"` is 0.05, `"1,200"` is 1200). */
function criteriaNumber(text: string, preferDDMMYYYY: boolean): number {
  return parseDate(text, preferDDMMYYYY) ?? parseNumericString(text) ?? NaN;
}

/** A value matches when its text matches the criteria (case-insensitively, with
 *  wildcards) or, for a numeric criteria, when its number is equal. */
function matchesTextOrNumber(criteria: string, preferDDMMYYYY: boolean): (value: CellValue) => boolean {
  const matchesText = textMatcher(criteria);
  const numCriteria = criteriaNumber(criteria, preferDDMMYYYY);
  const hasNumber = !isNaN(numCriteria);
  // Text patterns match text (a boolean as its name), never a number: Excel's `"1*"` skips
  // the number 10, and `0` does not match a text cell that toNumber would read as 0.
  return (value) => (typeof value !== "number" && matchesText(String(value))) || (hasNumber && holdsNumber(value) && toNumber(value) === numCriteria);
}

/** The matcher for the criteria argument at `index`, or the error it evaluated to.
 *
 *  A criteria is an expression like any other argument: `">=2"`, `C1`, `">="&C1`. Reading its
 *  source text instead matched `C1` against the letters "C1", so a criteria held in a cell or
 *  built with `&` matched nothing and the function answered a silent 0. */
export function criteriaArg(context: FunctionContext, args: string[], index: number): ((value: CellValue) => boolean) | SpreadsheetError {
  const criteria = context.evaluateFormula(requiredArg(context, args, index));
  if (isSpreadsheetErrorValue(criteria)) return criteria;
  // A logical criteria matches logical cells only, not the text "TRUE".
  if (typeof criteria === "boolean") return (value) => value === criteria;
  return parseCriteria(String(criteria), context.preferDDMMYYYY);
}
