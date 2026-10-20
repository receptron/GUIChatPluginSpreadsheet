/**
 * Formula Evaluator
 *
 * Evaluates spreadsheet formulas including functions, cell references, and arithmetic
 */

import { CALL_NAMES, FUNCTION_NAME_SOURCE, functionRegistry, isCallableName, tooFewArgumentsError, type CellCoordinates } from "./registry";

const SIMPLE_CALL = new RegExp(`^(${FUNCTION_NAME_SOURCE})\\((.*)\\)$`, "i");
const CALL_START = new RegExp(`^(${FUNCTION_NAME_SOURCE})\\(`, "i");
import type { CellValue, FormulaValue } from "./types";
import { isCellArray, normalizedValue, rowsOfRange, scalarOf } from "./cellArray";
import { alignedIndex, arrayOperands, combinedShape, parseArrayConstant, type ArrayOperand, type TableShape } from "./arrayExpression";
import { parseRangeBounds } from "./formulaRefs";
import { indexToColumn } from "./parser";
import { isSoleRangeReference } from "./spillCandidate";
import { endOfQuotedSheetName, UNQUOTED_SHEET_NAME } from "./sheetReference";
import { parseDate } from "./date-parser";
import { concatOperands, concatToSum, topLevelGroups } from "./concatPrecedence";
import { isEscapedAt } from "./escapes";
import { withBlankSides } from "./blankOperands";
import { caretToPow, rewriteComparisonEq, isSafeArithmetic, isSafeComparison, separateRepeatedSigns } from "./translateFormula";
import { foldComparisons, splitTopLevelComparisons } from "./textComparison";
import { standsAloneInConcat } from "./concatOperand";
import { stripOuterParens } from "./condition";
import { divZeroError, isFormulaError, unknownError, nameError, propagatedError } from "./formulaError";
import { errorCodeOf, isSpreadsheetErrorValue, NA_ERROR, spreadsheetError, type SpreadsheetError } from "./spreadsheet-errors";
import { booleansAsNumbers, logicalLiteralsAsBooleans, loneBoolean } from "./logicalLiterals";
import { textOperandsAsNumbers } from "./textArithmetic";

/**
 * Evaluation context for formulas
 */
export interface EvaluatorContext {
  getCellValue: (ref: string) => CellValue;
  getRangeValues: (range: string) => CellValue[];
  getRangeValuesRaw?: ((range: string) => CellValue[]) | undefined;
  getRangeValuesKeepingBlanks?: ((range: string) => CellValue[]) | undefined;
  countFilledCells?: ((range: string) => number) | undefined;
  evaluateFormula: (formula: string) => CellValue;
  /** A formula's value, a table included; see FunctionContext. */
  evaluateValue?: ((formula: string) => FormulaValue) | undefined;
  getRangeGrid?: ((range: string) => CellValue[][]) | undefined;
  /** Reading order for an ambiguous slash date; see engine/date-locale.ts. */
  preferDDMMYYYY?: boolean | undefined;
  /** Whether the referenced cell holds nothing. `getCellValue` reads such a cell as 0, which
   *  is right for arithmetic and wrong for `&`, where a blank cell joins as "". */
  isCellEmpty?: ((ref: string) => boolean) | undefined;
  currentCell?: CellCoordinates | undefined;
}

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
  return [...cellRefs].reverse().reduce((text, { ref, start }) => text.slice(0, start) + render(ref, start) + text.slice(start + ref.length), expr);
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

/** Run `new Function` on an expression the callers have already gated with a
 *  character allowlist. A JS parse/eval failure becomes #ERROR! — a genuinely
 *  broken formula that used to be swallowed into a bare string (#2359). A
 *  non-finite NUMBER result is only reachable by dividing by zero (comparisons
 *  yield booleans, concatenation yields strings), so it becomes #DIV/0!. */
function evalValidatedExpression(jsExpr: string): CellValue {
  let result: unknown;
  try {
    // eslint-disable -- sonarjs/code-eval
    result = new Function(`return (${separateRepeatedSigns(jsExpr)})`)();
  } catch {
    throw unknownError();
  }
  if (typeof result === "number") {
    if (!Number.isFinite(result)) throw divZeroError();
    return result;
  }
  if (typeof result === "string" || typeof result === "boolean") return result;
  throw unknownError();
}

/** A `&` expression joined with Excel's precedence, or null when it holds no `&` or its structure
 *  is not safe to run. The STRUCTURE is validated with literals masked — a literal may hold any
 *  character, so masking is what lets `=A1&"!"` and escaped operands through while still
 *  rejecting a genuinely unsafe expression. Numbers and booleans join too (`=A1&B1` with two
 *  numbers is "23", not 5), so a `&` is enough; the expression need not hold a quoted string. */
function evaluateConcat(expr: string): CellValue | null {
  if (!expr.includes("&")) return null;
  const result = concatToSum(expr);
  if (!isSafeConcatExpression(result)) return null;
  // An arithmetic operand answers like an expression of its own: 1/0 is #DIV/0!.
  concatOperands(expr).filter(isSafeArithmetic).forEach(evalValidatedExpression);
  return evalValidatedExpression(result);
}

const BOOLEAN_OPERAND = /^\(*\s*(true|false)\s*\)*$/i;

/** Whether `operand` is one string literal and nothing else. It must end on the quote it opened
 *  with: an unclosed `"abc` also runs to the end, and taken as a literal it lost its last letter. */
const isLoneLiteral = (operand: string): boolean =>
  (operand.startsWith('"') || operand.startsWith("'")) && operand.endsWith(operand[0] ?? "") && endOfStringLiteral(operand, 0) === operand.length;

/** One side of a comparison as a value, or null when it is not one this evaluator can read — the
 *  whole formula then comes back as its text, as it did before comparisons took text. */
function comparisonOperandValue(operand: string): CellValue | null {
  const booleanWord = BOOLEAN_OPERAND.exec(operand)?.[1];
  if (booleanWord !== undefined) return booleanWord.toLowerCase() === "true";
  const joined = evaluateConcat(operand);
  if (joined !== null) return joined;
  // A literal may come wrapped, `("a")` or a text cell as `(A1)`; brackets that wrap all of it change nothing.
  if (isSafeArithmetic(operand) || isLoneLiteral(stripOuterParens(operand))) return evalValidatedExpression(operand);
  return null;
}

const isCellValue = (value: CellValue | null): value is CellValue => value !== null;

/** For each side of a top-level comparison, whether it is nothing but a reference to a blank
 *  cell. Read before the substitution, which reads a blank as 0; null without a comparison. */
function blankComparisonSides(expr: string, context: EvaluatorContext): boolean[] | null {
  const comparison = splitTopLevelComparisons(expr);
  const isCellEmpty = context.isCellEmpty;
  if (!comparison || !isCellEmpty) return null;
  return comparison.operands.map((operand) => {
    const ref = loneReference(operand);
    return ref !== null && isCellEmpty(ref);
  });
}

/** The reference an operand is, perhaps in brackets, or null when it is anything more. */
export function loneReference(operand: string): string | null {
  const inner = stripOuterParens(operand).trim();
  const [only, ...rest] = findCellRefs(inner);
  return only && rest.length === 0 && only.start === 0 && only.ref.length === inner.length ? only.ref : null;
}

/** `expr` with each top-level bracketed part evaluated and written as its
 *  value. A part that is only a reference is left for the substitution, which knows a blank
 *  cell from a 0 (#127), and a range is left as written. */
function withGroupsEvaluated(expr: string, context: EvaluatorContext): string {
  const groups = topLevelGroups(expr).filter(({ open, close }) => {
    // A bracket right after a name is not a group: the calls are already replaced by their
    // values, so what is left (`A1(2)`) is malformed and stays so.
    const inner = expr.slice(open + 1, close).trim();
    const followsName = /[\w.$]$/.test(expr.slice(0, open));
    return !followsName && inner !== "" && !inner.includes(":") && loneReference(inner) === null;
  });
  return groups.reduceRight((rewritten, { open, close }) => {
    const value = context.evaluateFormula(expr.slice(open + 1, close));
    if (isSpreadsheetErrorValue(value)) throw propagatedError(value.code);
    return rewritten.slice(0, open) + renderOperand(value) + rewritten.slice(close + 1);
  }, expr);
}

/** An array operand as the element formulas see it: its shape, and what stands in its place in the
 *  formula for one element — the text written there, or the error that element is. */
interface OperandTable {
  shape: TableShape;
  elementAt: (row: number, col: number) => string | SpreadsheetError;
}

/** A range's element is the reference to its cell (`A1:A3*2` → `A2*2`), so a blank cell, text and
 *  an error cell answer as a reference to that one cell does. */
function rangeTable(range: string): OperandTable {
  const bounds = parseRangeBounds(range);
  if (!bounds) throw unknownError(`Invalid range: ${range}`);
  const [top, left] = [Math.min(bounds.startRow, bounds.endRow), Math.min(bounds.startCol, bounds.endCol)];
  const shape = { rows: Math.abs(bounds.endRow - bounds.startRow) + 1, columns: Math.abs(bounds.endCol - bounds.startCol) + 1 };
  return { shape, elementAt: (row, col) => `${bounds.sheetPrefix}${indexToColumn(left + col)}${top + row}` };
}

/** Values written in their element's place: text as a literal, a number or a logical value bracketed. */
function valueTable(rows: CellValue[][]): OperandTable {
  const shape = { rows: rows.length, columns: rows[0]?.length ?? 1 };
  const elementAt = (row: number, col: number): string | SpreadsheetError => {
    const value = rows[row]?.[col] ?? "";
    if (isSpreadsheetErrorValue(value)) return value;
    return typeof value === "string" ? renderOperand(value) : `(${String(value)})`;
  };
  return { shape, elementAt };
}

function operandTable({ kind, text }: ArrayOperand, context: EvaluatorContext): OperandTable {
  if (kind === "range") return rangeTable(text);
  if (kind === "constant") {
    const rows = parseArrayConstant(text);
    if (!rows) throw unknownError(`Invalid array constant: ${text}`);
    return valueTable(rows);
  }
  const value = normalizedValue(context.evaluateValue ? context.evaluateValue(text) : context.evaluateFormula(text));
  return valueTable(isCellArray(value) ? value : [[value]]);
}

/** One element of an expression over arrays: the formula with each operand replaced by its element
 *  there, evaluated as any formula is. A failure is that element's error; the others still answer. */
function evaluateElement(formula: string, operands: ArrayOperand[], pieces: (string | SpreadsheetError)[], context: EvaluatorContext): CellValue {
  const error = pieces.find(isSpreadsheetErrorValue);
  if (error) return error;
  const elementFormula = operands.reduceRight((text, { start, end }, index) => {
    const piece = pieces[index];
    return text.slice(0, start) + (typeof piece === "string" ? piece : "") + text.slice(end);
  }, formula);
  try {
    return context.evaluateFormula(elementFormula);
  } catch (failure) {
    if (isFormulaError(failure)) return spreadsheetError(failure.display);
    throw failure;
  }
}

/** An expression over arrays, as a table: the largest height and width among its operands, a single
 *  row or column repeated along the other, and #N/A past the end of a shorter operand (Excel). */
function evaluateOverArrays(formula: string, operands: ArrayOperand[], context: EvaluatorContext): FormulaValue {
  const tables = operands.map((operand) => operandTable(operand, context));
  const shape = combinedShape(tables.map((table) => table.shape));
  const pieceAt = (table: OperandTable, row: number, col: number): string | SpreadsheetError => {
    const [tableRow, tableCol] = [alignedIndex(table.shape.rows, row), alignedIndex(table.shape.columns, col)];
    return tableRow < 0 || tableCol < 0 ? NA_ERROR : table.elementAt(tableRow, tableCol);
  };
  const rows = Array.from({ length: shape.rows }, (_, row) =>
    Array.from({ length: shape.columns }, (_, col) =>
      evaluateElement(
        formula,
        operands,
        tables.map((table) => pieceAt(table, row, col)),
        context,
      ),
    ),
  );
  return normalizedValue(rows);
}

/**
 * Evaluate a formula string
 *
 * Supports:
 * - Function calls: SUM(A1:A10), ROUND(B2, 2)
 * - Cell references: A1, B2, Sheet1!A1
 * - Arithmetic: 2+3, A1*B1, (A1+B1)/2
 * - Nested expressions: ROUND(SUM(A1:A10)/COUNT(A1:A10), 2)
 *
 * A genuine failure THROWS (a typed FormulaError or any handler error) rather
 * than returning the raw formula text; the calculator classifies it into
 * errors[] and shows the Excel error value in the cell (#2359).
 *
 * @param formula - Formula string (without leading =)
 * @param context - Evaluation context with cell/range accessors
 * @returns Evaluated result (number or string)
 */
export function evaluateFormula(writtenFormula: string, context: EvaluatorContext): FormulaValue {
  // TRUE written in the formula reads as a logical cell does from here on.
  const formula = logicalLiteralsAsBooleans(writtenFormula);
  // A formula that is one string literal is its text. Only one: `"a"="b"` also
  // starts and ends with a quote, and is a comparison.
  const trimmed = formula.trim();
  if (isLoneLiteral(trimmed)) {
    const stringValue = trimmed.slice(1, -1); // Remove first and last character (quotes)

    // Auto-parse date strings to serial numbers for compatibility with date arithmetic
    // This allows formulas like =HLOOKUP("6/1/2024", ...) to work with parsed date cells
    const dateSerial = parseDate(stringValue, context.preferDDMMYYYY);
    if (dateSerial !== null) {
      return dateSerial;
    }

    return stringValue;
  }

  // A formula that is a range and nothing else answers its cells, each as `=A1` reads it.
  if (isSoleRangeReference(trimmed)) {
    const cells = (context.getRangeValuesRaw ? rowsOfRange(trimmed, context.getRangeValuesRaw) : null) ?? context.getRangeGrid?.(trimmed);
    if (cells) return normalizedValue(cells);
  }

  // Check if it's a SIMPLE function call (not a complex expression)
  // We need to ensure the formula is JUST a function, not "FUNC(...) + something"
  const [, funcName, argsStr] = formula.match(SIMPLE_CALL) ?? [];
  if (funcName !== undefined && argsStr !== undefined && isCallableName(funcName)) {
    // Check that the closing paren is actually the end of the function
    // by counting parentheses in argsStr
    let parenDepth = 0;
    let isValidFunction = true;
    for (const char of argsStr) {
      if (char === "(") parenDepth++;
      else if (char === ")") {
        parenDepth--;
        if (parenDepth < 0) {
          // More closing parens than opening - this means we matched too much
          isValidFunction = false;
          break;
        }
      }
    }

    // Normalize function name to uppercase for registry lookup
    const normalizedFuncName = funcName.toUpperCase();
    const func = functionRegistry.get(normalizedFuncName);

    if (func && isValidFunction) {
      const args = parseFunctionArgs(argsStr);

      // Validate argument count
      if (func.minArgs !== undefined && args.length < func.minArgs) {
        throw tooFewArgumentsError(normalizedFuncName, func.minArgs);
      }
      if (func.maxArgs !== undefined && args.length > func.maxArgs) {
        throw new Error(`${normalizedFuncName} accepts at most ${func.maxArgs} argument${func.maxArgs !== 1 ? "s" : ""}`);
      }

      // Execute function with context. Only a function that says it may answer a table answers one.
      const result = func.handler(args, {
        functionName: normalizedFuncName,
        getCellValue: context.getCellValue,
        getRangeValues: context.getRangeValues,
        getRangeValuesRaw: context.getRangeValuesRaw,
        getRangeValuesKeepingBlanks: context.getRangeValuesKeepingBlanks,
        countFilledCells: context.countFilledCells,
        evaluateFormula: context.evaluateFormula,
        evaluateValue: context.evaluateValue,
        getRangeGrid: context.getRangeGrid,
        isBlankReference: (arg) => {
          const ref = loneReference(arg);
          return ref !== null && context.isCellEmpty?.(ref) === true;
        },
        preferDDMMYYYY: context.preferDDMMYYYY,
        currentCell: context.currentCell,
      });
      return func.spills === true ? normalizedValue(result) : scalarOf(result);
    }

    // A balanced `NAME(...)` spanning the whole formula whose NAME is not a
    // registered function is an unrecognized name — Excel's #NAME?. Surfacing
    // it here also stops the arithmetic path below from recursing on it forever
    // and leaving the literal text in the cell (#2359).
    if (isValidFunction && !func) {
      throw nameError(normalizedFuncName);
    }
  }

  // An expression over arrays (`A1:A3*2`, `{1,2}&"x"`) answers a table, element by element.
  const operands = arrayOperands(formula, CALL_NAMES);
  if (operands.length > 0) return evaluateOverArrays(formula, operands, context);

  // Handle simple arithmetic expressions with cell references
  // First, replace any function calls within the expression
  let expr = formula;

  // Find and evaluate function calls (e.g., TODAY(), SUM(A1:A10), LOWER(A1), etc.)
  // Use a simpler approach: find function names followed by parentheses
  // and manually parse the matching closing parenthesis
  let searchIndex = 0;
  const maxIterations = 100; // Prevent infinite loops
  let iterations = 0;

  while (searchIndex < expr.length && iterations < maxIterations) {
    iterations++;
    // A call written inside a string literal is text, not a call.
    if (expr[searchIndex] === '"' || expr[searchIndex] === "'") {
      searchIndex = endOfStringLiteral(expr, searchIndex);
      continue;
    }
    const [, funcName] = expr.substring(searchIndex).match(CALL_START) ?? [];
    if (funcName === undefined || !isCallableName(funcName)) {
      // No more functions found, move to next character
      searchIndex++;
      if (searchIndex >= expr.length) break;
      continue;
    }

    const funcStartIndex = searchIndex;
    const argsStartIndex = searchIndex + funcName.length + 1;

    // Find matching closing parenthesis
    let depth = 1;
    let argsEndIndex = argsStartIndex;
    let inString = false;
    let stringChar = "";

    while (argsEndIndex < expr.length && depth > 0) {
      const char = expr[argsEndIndex];
      // Track string boundaries
      if ((char === '"' || char === "'") && !isEscapedAt(expr, argsEndIndex)) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = "";
        }
      }

      // Only count parens outside of strings
      if (!inString) {
        if (char === "(") depth++;
        else if (char === ")") depth--;
      }
      argsEndIndex++;
    }

    if (depth === 0) {
      const fullMatch = expr.substring(funcStartIndex, argsEndIndex);
      const result = context.evaluateFormula(fullMatch);
      // A nested call that errored poisons the expression the same way an
      // errored reference does — substituting it produced `"#NUM!"+1` text.
      // Only the error VALUE counts: text that merely spells an error (CONCAT)
      // is an ordinary operand.
      if (isSpreadsheetErrorValue(result)) throw propagatedError(result.code);
      // A string result is rendered like a cell's text, escapes included — wrapped
      // in bare quotes, a result holding `"` or ending in `\` broke the expression.
      // Numbers and booleans are wrapped in parentheses.
      const replacement = typeof result === "string" ? renderOperand(result) : `(${result})`;
      expr = expr.substring(0, funcStartIndex) + replacement + expr.substring(argsEndIndex);
      // Continue from after the replacement
      searchIndex = funcStartIndex + replacement.length;
    } else {
      searchIndex++;
    }
  }

  // A bracketed part is a value of its own, as a call is: `("a"="b")&"x"` joins the comparison's
  // answer, where the whole formula used to come back as its text.
  expr = withGroupsEvaluated(expr, context);

  // Then replace cell references with their values. Detection skips quoted
  // string literals so a `"A1"` constant is not read as a reference.
  const cellRefs = findCellRefs(expr);

  // A formula that is nothing but one reference returns that cell's value
  // directly. Rendering it into an expression first would mean escaping the
  // text, and the escapes would survive into the result — `=A1` on a cell
  // holding `say "hi"` would come back `say \"hi\"`. Surrounding whitespace
  // (`= A1`, `=A1 `) is part of "nothing but one reference", so compare the
  // span against the trimmed expression rather than the raw one.
  const soleRef = cellRefs.length === 1 ? cellRefs[0] : undefined;
  if (soleRef) {
    const before = expr.slice(0, soleRef.start);
    const after = expr.slice(soleRef.start + soleRef.ref.length);
    if (before.trim() === "" && after.trim() === "") {
      return context.getCellValue(soleRef.ref);
    }
  }

  const expressionWithRefs = expr;
  const blankSides = blankComparisonSides(expressionWithRefs, context);
  expr = substituteCellRefs(expr, cellRefs, (ref, start) => {
    if (standsAloneInConcat(expressionWithRefs, start, start + ref.length) && context.isCellEmpty?.(ref)) return '""';
    const value = context.getCellValue(ref);
    // A referenced cell holding an error poisons the whole expression:
    // rendering it would produce `"#DIV/0!"+1` garbage, so propagate the error
    // instead of substituting it (#2359, Excel behaviour). A cell whose stored
    // TEXT spells an error counts here too — Excel stores a typed error literal
    // as an error, and arithmetic over it is never meaningful.
    const referencedErrorCode = errorCodeOf(value);
    if (referencedErrorCode !== null) throw propagatedError(referencedErrorCode);
    return renderOperand(value);
  });

  // Parse date strings in arithmetic expressions (e.g., "06/01/2025" → serial number)
  // This allows formulas like =B3-"06/01/2025" to work correctly
  expr = expr.replace(/"([^"]+)"/g, (match, dateStr) => {
    const dateSerial = parseDate(dateStr, context.preferDDMMYYYY);
    if (dateSerial !== null) {
      return dateSerial.toString();
    }
    return match; // Keep original if not a date
  });

  // Text beside an arithmetic operator is its number, or the expression is #VALUE!.
  const numericText = textOperandsAsNumbers(expr);
  if (isSpreadsheetErrorValue(numericText)) throw propagatedError(numericText.code);
  expr = numericText;

  // Replace ^ with ** for exponentiation
  expr = caretToPow(expr);

  // A top-level comparison compares each side's value the way Excel does: text,
  // booleans and a `&` on a side included, `<>` included, a chain left to right.
  const comparison = splitTopLevelComparisons(expr);
  if (comparison) {
    const values = comparison.operands.map(comparisonOperandValue);
    const sidesMatch = blankSides?.length === values.length;
    if (values.every(isCellValue)) return foldComparisons(sidesMatch ? withBlankSides(values, blankSides) : values, comparison.operators);
  }

  const joined = evaluateConcat(expr);
  if (joined !== null) return joined;

  // A logical value alone, perhaps in brackets, is that value; in arithmetic TRUE reads as 1.
  const referencedBoolean = loneBoolean(expr);
  if (referencedBoolean !== null) return referencedBoolean;
  expr = booleansAsNumbers(expr);

  // Safely evaluate comparison expressions (e.g., 5=6, (5)>(6)). The allowlist
  // (numbers, `= != < > <= >=`, parens, whitespace) gates the evaluation. It is
  // a superset of the arithmetic allowlist, so a plain `1/0` is handled here —
  // evalValidatedExpression turns its Infinity into #DIV/0! (#2359).
  if (isSafeComparison(expr)) {
    return evalValidatedExpression(rewriteComparisonEq(expr));
  }

  // Safely evaluate arithmetic expressions (numbers, operators, parens,
  // whitespace, decimal points).
  if (isSafeArithmetic(expr)) {
    return evalValidatedExpression(expr);
  }

  // If the final expression is a quoted string literal, unwrap it
  const trimmedExpr = expr.trim();
  if ((trimmedExpr.startsWith('"') && trimmedExpr.endsWith('"')) || (trimmedExpr.startsWith("'") && trimmedExpr.endsWith("'"))) {
    return trimmedExpr.slice(1, -1); // Remove quotes
  }

  return expr; // Return processed expression (with cell refs replaced, etc.)
}
