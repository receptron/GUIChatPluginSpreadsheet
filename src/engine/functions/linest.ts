/**
 * LINEST, LOGEST, GROWTH, and TREND at several new x: least squares over one or more x variables,
 * reading known_y and known_x whole, as tables. The rules live in linest-math.ts.
 */

import { functionRegistry, requiredArg, toNumber, type FunctionContext, type FunctionHandler } from "../registry";
import { holdsNumber } from "../numericCoercion";
import { isSpreadsheetErrorValue, NUM_ERROR, REF_ERROR, VALUE_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import type { CellValue, FormulaValue } from "../types";
import { fitRegression, linestTable, predict, regressionData, type Regression, type RegressionData } from "./linest-math";
import { trendAt } from "./regression-math";
import { booleanArg } from "./table-args";

/** An argument's cells in rows, blanks kept as blanks; one value is a 1×1 table. */
const gridArg = (arg: string, context: FunctionContext): CellValue[][] => (context.getRangeGrid ? context.getRangeGrid(arg) : [[context.evaluateFormula(arg)]]);

const isLeftOut = (args: string[], index: number): boolean => (args[index]?.trim() ?? "") === "";

const optionalGrid = (args: string[], context: FunctionContext, index: number): CellValue[][] | null => {
  const arg = args[index];
  return arg === undefined || isLeftOut(args, index) ? null : gridArg(arg, context);
};

/** known_y and known_x as a fit's data, y taken through `transformY` (LOGEST's and GROWTH's ln). */
function readData(args: string[], context: FunctionContext, transformY: (ys: number[]) => number[] | SpreadsheetError): RegressionData | SpreadsheetError {
  const data = regressionData(gridArg(requiredArg(context, args, 0), context), optionalGrid(args, context, 1));
  if (isSpreadsheetErrorValue(data)) return data;
  const ys = transformY(data.ys);
  return isSpreadsheetErrorValue(ys) ? ys : { ...data, ys };
}

const untransformed = (ys: number[]): number[] => ys;

/** ln y, for the exponential fits; a y that is not positive has none: #NUM!. */
const logarithms = (ys: number[]): number[] | SpreadsheetError => (ys.every((y) => y > 0) ? ys.map(Math.log) : NUM_ERROR);

/** The fit LINEST and LOGEST describe, with its table. */
function regressionTable(args: string[], context: FunctionContext, transformY: typeof logarithms): CellValue[][] | SpreadsheetError {
  const data = readData(args, context, transformY);
  if (isSpreadsheetErrorValue(data)) return data;
  const withConstant = booleanArg(args, context, 2, true);
  if (isSpreadsheetErrorValue(withConstant)) return withConstant;
  const stats = booleanArg(args, context, 3);
  if (isSpreadsheetErrorValue(stats)) return stats;
  return linestTable(fitRegression(data, withConstant), data, stats);
}

const linestHandler: FunctionHandler = (args, context) => regressionTable(args, context, untransformed);

// LOGEST's first row is the exponential curve's own: e to each coefficient and to the constant.
const logestHandler: FunctionHandler = (args, context) => {
  const table = regressionTable(args, context, logarithms);
  if (isSpreadsheetErrorValue(table)) return table;
  const [coefficients = [], ...stats] = table;
  return [coefficients.map((value) => (typeof value === "number" ? Math.exp(value) : value)), ...stats];
};

/** The new x values, as numbers in rows; an error cell is that error, other non-numbers #VALUE!. */
function newXs(grid: CellValue[][]): number[][] | SpreadsheetError {
  const error = grid.flat().find(isSpreadsheetErrorValue);
  if (error) return error;
  return grid.flat().every(holdsNumber) ? grid.map((row) => row.map(toNumber)) : VALUE_ERROR;
}

/** The fit's predictions at new x laid out as Excel lays them: for one variable, one per cell of
 *  new_x; for several, one per row of new_x (a column of y) or per column (a row of y), new_x
 *  holding one value per variable there, or #REF!. */
function predictions(data: RegressionData, grid: number[][], at: (xs: number[]) => CellValue): FormulaValue {
  if (data.columns.length === 1) return grid.map((row) => row.map((x) => at([x])));
  const variables = data.columns.length;
  if (!data.byRows) return grid.every((row) => row.length === variables) ? grid.map((row) => [at(row)]) : REF_ERROR;
  if (grid.length !== variables) return REF_ERROR;
  return [Array.from({ length: grid[0]?.length ?? 0 }, (_, col) => at(grid.map((row) => row[col] ?? 0)))];
}

/** known_x as new_x when new_x is left out: the x written, or 1, 2, 3, … laid out as known_y is. */
function defaultNewXs(args: string[], context: FunctionContext): CellValue[][] {
  const written = optionalGrid(args, context, 1);
  if (written) return written;
  const yGrid = gridArg(requiredArg(context, args, 0), context);
  const width = yGrid[0]?.length ?? 0;
  return yGrid.map((row, r) => row.map((_, c) => r * width + c + 1));
}

/** How a fit answers at one set of new x values. */
type Predictor = (fit: Regression, data: RegressionData, withConstant: boolean) => (xs: number[]) => CellValue;

/** TREND and GROWTH at every new x (known_x when new_x is left out). */
function curveAt(args: string[], context: FunctionContext, transformY: typeof logarithms, predictor: Predictor): FormulaValue {
  const data = readData(args, context, transformY);
  if (isSpreadsheetErrorValue(data)) return data;
  const grid = newXs(isLeftOut(args, 2) ? defaultNewXs(args, context) : gridArg(requiredArg(context, args, 2), context));
  if (isSpreadsheetErrorValue(grid)) return grid;
  const withConstant = booleanArg(args, context, 3, true);
  if (isSpreadsheetErrorValue(withConstant)) return withConstant;
  return predictions(data, grid, predictor(fitRegression(data, withConstant), data, withConstant));
}

/** TREND at a table of new x. One variable is fitted as TREND at one new x fits it (trendAt), so a
 *  cell of the table answers what TREND at that x alone answers. */
export const trendOverTable: FunctionHandler = (args, context) =>
  curveAt(args, context, untransformed, (fit, data, withConstant) => {
    const [xs] = data.columns;
    if (data.columns.length === 1 && xs) return ([x = 0]) => trendAt(data.ys, xs, x, withConstant);
    return (row) => predict(fit, row);
  });

const growthHandler: FunctionHandler = (args, context) => curveAt(args, context, logarithms, (fit) => (xs) => Math.exp(predict(fit, xs)));

const LINEST_FUNCTIONS = [
  {
    name: "LINEST",
    handler: linestHandler,
    description:
      "Returns the least-squares line's coefficients, from the last x to the first, then the constant; with stats TRUE, also their standard errors, r², the standard error of y, F, the degrees of freedom and the sums of squares; spills",
    examples: ["LINEST(B2:B20, A2:A20)", "LINEST(E2:E12, A2:D12, TRUE, TRUE)"],
  },
  {
    name: "LOGEST",
    handler: logestHandler,
    description: "Returns the bases of the exponential curve y = b·m₁^x₁·…·mₙ^xₙ fitted to known_y (each y > 0), laid out as LINEST lays out its line; spills",
    examples: ["LOGEST(B2:B20, A2:A20)", "LOGEST(B2:B20, A2:A20, TRUE, TRUE)"],
  },
  {
    name: "GROWTH",
    handler: growthHandler,
    description: "Returns the exponential curve LOGEST fits, at each new x (known_x when new_x is left out); spills",
    examples: ["GROWTH(B2:B20, A2:A20, A21:A23)", "GROWTH(B2:B20, , 21)"],
  },
];

LINEST_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, minArgs: 1, maxArgs: 4, category: "Statistical", spills: true }));
