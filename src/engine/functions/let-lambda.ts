/**
 * LET, LAMBDA, MAP, BYROW, BYCOL and REDUCE. A name stands for its value by being written into the
 * formula in its place (nameBinding.ts): a reference as the reference, so `ROW(x)` and a blank cell
 * still read as they do, and any other value as text the evaluator reads back as that value — a
 * literal, or an array constant for a table.
 */

import { isCellArray, normalizedValue } from "../cellArray";
import { renderOperand } from "../evaluator";
import { parseRangeBounds } from "../formulaRefs";
import { isFormulaError } from "../formulaError";
import { parseLambda, substituteNames, type Binding, type Lambda, isValidName } from "../nameBinding";
import { indexToColumn } from "../parser";
import { functionRegistry, requiredArg, type FunctionContext, type FunctionHandler } from "../registry";
import { isSoleRangeReference, isSoleReference } from "../spillCandidate";
import { CALC_ERROR, isSpreadsheetErrorValue, NA_ERROR, NAME_ERROR, spreadsheetError, VALUE_ERROR } from "../spreadsheet-errors";
import type { CellArray, CellValue, FormulaValue } from "../types";
import { alignedIndex, combinedShape } from "../arrayExpression";

/** One cell as an array constant writes it. */
function constantElement(value: CellValue): string {
  if (isSpreadsheetErrorValue(value)) return value.code;
  if (typeof value === "string") return renderOperand(value);
  return typeof value === "boolean" ? String(value).toUpperCase() : String(value);
}

/** Text that the evaluator reads back as `value`: a literal, a bracketed number or logical value, or
 *  an array constant for a table (and for an error, so that it stays an error value). */
export function valueAsText(value: FormulaValue): string {
  if (isCellArray(value)) return `{${value.map((row) => row.map(constantElement).join(",")).join(";")}}`;
  if (isSpreadsheetErrorValue(value)) return `{${value.code}}`;
  return typeof value === "string" ? renderOperand(value) : `(${String(value)})`;
}

/** A formula's value, a failure being its error. */
function valueOf(formula: string, context: FunctionContext): FormulaValue {
  try {
    return context.evaluateValue ? context.evaluateValue(formula) : context.evaluateFormula(formula);
  } catch (failure) {
    if (isFormulaError(failure)) return spreadsheetError(failure.display);
    throw failure;
  }
}

/** What a name bound to `written` stands for: a LAMBDA, a reference as written, or its value. */
function bindingFor(name: string, written: string, context: FunctionContext): Binding {
  const lambda = parseLambda(written);
  if (lambda) return { name, lambda };
  if (isSoleReference(written)) return { name, text: written.trim() };
  return { name, text: valueAsText(valueOf(written, context)) };
}

// LET(name1, value1, [name2, value2, …], calculation): each value may use the names before it.
const letHandler: FunctionHandler = (args, context) => {
  if (args.length < 3 || args.length % 2 === 0) return VALUE_ERROR;
  const pairs = Array.from({ length: (args.length - 1) / 2 }, (_, index) => ({ name: args[2 * index]?.trim() ?? "", written: args[2 * index + 1] ?? "" }));
  if (!pairs.every(({ name }) => isValidName(name))) return NAME_ERROR;
  const bindings = pairs.reduce<Binding[]>((bound, { name, written }) => [...bound, bindingFor(name, substituteNames(written, bound), context)], []);
  return valueOf(substituteNames(args.at(-1) ?? "", bindings), context);
};

// A LAMBDA that is not called has no value to show (Excel's #CALC!).
const lambdaHandler: FunctionHandler = () => CALC_ERROR;

/** An array argument whose elements a LAMBDA is given: each element's text, by row and column. */
interface ElementSource {
  rows: number;
  columns: number;
  textAt: (row: number, col: number) => string;
  /** One row's or one column's text: a range, or an array constant. */
  rowText: (row: number) => string;
  columnText: (col: number) => string;
}

/** A range's elements are references to its cells, and its rows and columns ranges, as in `A1:A3*2`. */
function rangeSource(range: string): ElementSource | null {
  const bounds = parseRangeBounds(range.trim());
  if (!bounds) return null;
  const [top, left] = [Math.min(bounds.startRow, bounds.endRow), Math.min(bounds.startCol, bounds.endCol)];
  const [rows, columns] = [Math.abs(bounds.endRow - bounds.startRow) + 1, Math.abs(bounds.endCol - bounds.startCol) + 1];
  const cell = (row: number, col: number): string => `${indexToColumn(left + col)}${top + row}`;
  return {
    rows,
    columns,
    textAt: (row, col) => `${bounds.sheetPrefix}${cell(row, col)}`,
    rowText: (row) => `${bounds.sheetPrefix}${cell(row, 0)}:${cell(row, columns - 1)}`,
    columnText: (col) => `${bounds.sheetPrefix}${cell(0, col)}:${cell(rows - 1, col)}`,
  };
}

function tableSource(table: CellArray): ElementSource {
  return {
    rows: table.length,
    columns: table[0]?.length ?? 0,
    textAt: (row, col) => valueAsText(table[row]?.[col] ?? ""),
    rowText: (row) => valueAsText([table[row] ?? []]),
    columnText: (col) => valueAsText(table.map((cells) => [cells[col] ?? ""])),
  };
}

function elementSource(arg: string, context: FunctionContext): ElementSource {
  const range = isSoleRangeReference(arg) ? rangeSource(arg) : null;
  if (range) return range;
  const value = normalizedValue(valueOf(arg, context));
  return tableSource(isCellArray(value) ? value : [[value]]);
}

/** The LAMBDA an argument is, with the number of parameters wanted, or #VALUE!. */
function lambdaArg(arg: string, parameterCount: number): Lambda | typeof VALUE_ERROR {
  const lambda = parseLambda(arg);
  return lambda && lambda.params.length === parameterCount ? lambda : VALUE_ERROR;
}

/** The LAMBDA's body over these argument texts, evaluated. */
function callFor(lambda: Lambda, argumentTexts: string[], context: FunctionContext): FormulaValue {
  const bindings = lambda.params.map((name, index): Binding => ({ name, text: argumentTexts[index] ?? "" }));
  return normalizedValue(valueOf(substituteNames(lambda.body, bindings), context));
}

/** Where one value is wanted, a table of more than one cell is #CALC!. */
const singleCell = (value: FormulaValue): CellValue => (isCellArray(value) ? CALC_ERROR : value);

// MAP(array1, [array2, …], lambda): the LAMBDA at each element, the arrays lined up as in A1:A3+B1:B3.
const mapHandler: FunctionHandler = (args, context) => {
  const lambda = lambdaArg(args.at(-1) ?? "", args.length - 1);
  if (isSpreadsheetErrorValue(lambda)) return lambda;
  const sources = args.slice(0, -1).map((arg) => elementSource(arg, context));
  const shape = combinedShape(sources.map((source) => ({ rows: source.rows, columns: source.columns })));
  return Array.from({ length: shape.rows }, (_, row) =>
    Array.from({ length: shape.columns }, (_, col) => {
      const positions = sources.map((source) => ({ source, sourceRow: alignedIndex(source.rows, row), sourceCol: alignedIndex(source.columns, col) }));
      if (positions.some(({ sourceRow, sourceCol }) => sourceRow < 0 || sourceCol < 0)) return NA_ERROR;
      const texts = positions.map(({ source, sourceRow, sourceCol }) => source.textAt(sourceRow, sourceCol));
      return singleCell(callFor(lambda, texts, context));
    }),
  );
};

/** BYROW and BYCOL: the LAMBDA at each row (a column of answers) or each column (a row of answers). */
const byLineHandler =
  (byRows: boolean): FunctionHandler =>
  (args, context) => {
    const lambda = lambdaArg(requiredArg(context, args, 1), 1);
    if (isSpreadsheetErrorValue(lambda)) return lambda;
    const source = elementSource(requiredArg(context, args, 0), context);
    const lines = Array.from({ length: byRows ? source.rows : source.columns }, (_, index) =>
      singleCell(callFor(lambda, [byRows ? source.rowText(index) : source.columnText(index)], context)),
    );
    return byRows ? lines.map((value) => [value]) : [lines];
  };

// REDUCE([initial], array, lambda(accumulator, value)): the LAMBDA over every element in reading
// order. An initial value left out is 0, as a blank argument reads in arithmetic.
const reduceHandler: FunctionHandler = (args, context) => {
  const lambda = lambdaArg(requiredArg(context, args, 2), 2);
  if (isSpreadsheetErrorValue(lambda)) return lambda;
  const initial = args[0]?.trim() ? valueOf(args[0], context) : 0;
  const source = elementSource(requiredArg(context, args, 1), context);
  const texts = Array.from({ length: source.rows * source.columns }, (_, index) => source.textAt(Math.floor(index / source.columns), index % source.columns));
  return texts.reduce<FormulaValue>((accumulator, text) => callFor(lambda, [valueAsText(accumulator), text], context), initial);
};

const LET_LAMBDA_FUNCTIONS = [
  {
    name: "LET",
    handler: letHandler,
    minArgs: 3,
    maxArgs: 253,
    description: "Gives names to values and calculates with them: LET(name1, value1, [name2, value2, …], calculation); a value may use the names before it",
    examples: ["LET(total, SUM(A2:A9), total / COUNT(A2:A9))", "LET(x, A2:A9, y, x * 2, SUM(y))"],
  },
  {
    name: "LAMBDA",
    handler: lambdaHandler,
    minArgs: 1,
    maxArgs: 254,
    description:
      "A calculation over named parameters, LAMBDA(param1, …, calculation), called with arguments (LAMBDA(x, x*2)(3)) or given to MAP, BYROW, BYCOL or REDUCE",
    examples: ["LAMBDA(x, x * 2)(3)", "MAP(A2:A9, LAMBDA(x, x * 2))"],
  },
  {
    name: "MAP",
    handler: mapHandler,
    minArgs: 2,
    maxArgs: 254,
    description: "Calls a LAMBDA with each element of one or more arrays, lined up as in A1:A3+B1:B3, and answers the results as a table",
    examples: ["MAP(A2:A9, LAMBDA(x, IF(x > 4, x * x, x)))", "MAP(A2:A9, B2:B9, LAMBDA(a, b, a * b))"],
  },
  {
    name: "BYROW",
    handler: byLineHandler(true),
    minArgs: 2,
    maxArgs: 2,
    description: "Calls a LAMBDA with each row of an array and answers one value per row, as a column (#CALC! for a row whose answer is a table)",
    examples: ["BYROW(A2:C9, LAMBDA(row, MAX(row)))"],
  },
  {
    name: "BYCOL",
    handler: byLineHandler(false),
    minArgs: 2,
    maxArgs: 2,
    description: "Calls a LAMBDA with each column of an array and answers one value per column, as a row (#CALC! for a column whose answer is a table)",
    examples: ["BYCOL(A2:C9, LAMBDA(col, SUM(col)))"],
  },
  {
    name: "REDUCE",
    handler: reduceHandler,
    minArgs: 3,
    maxArgs: 3,
    description:
      "Calls a LAMBDA(accumulator, value) with each element of an array in reading order, carrying its answer forward; an initial value left out is 0",
    examples: ["REDUCE(0, A2:A9, LAMBDA(total, x, total + x ^ 2))", "REDUCE(, A2:C3, LAMBDA(a, b, a + b))"],
  },
];

LET_LAMBDA_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Logical", spills: true }));
