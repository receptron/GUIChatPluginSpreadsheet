/**
 * RAND, RANDBETWEEN and RANDARRAY. Each call draws from a stream seeded by the sheet, the cell and
 * the call's place among the random calls of that cell's formula (random-math.ts), so the numbers
 * hold still from one calculation to the next.
 */

import { functionRegistry, type CellCoordinates, type FunctionContext, type FunctionHandler } from "../registry";
import { isSpreadsheetErrorValue } from "../spreadsheet-errors";
import { hashKey, randomBetween, randomTable, uniformStream } from "./random-math";
import { allRead, booleanArg, numberArg, optionalNumberArg } from "./table-args";

// How many random calls each cell's formula has made in this calculation. A cell being calculated is
// a fresh object each time, so the count starts again with every calculation.
const callsMade = new WeakMap<CellCoordinates, number>();
const OUTSIDE_A_CELL: CellCoordinates = { row: -1, col: -1 };

/** The stream for the next random call of the formula being calculated. */
function nextStream(context: FunctionContext): () => number {
  const cell = context.currentCell ?? OUTSIDE_A_CELL;
  const ordinal = callsMade.get(cell) ?? 0;
  callsMade.set(cell, ordinal + 1);
  return uniformStream(hashKey(`${context.currentSheet ?? ""}\u0000${cell.row}\u0000${cell.col}\u0000${ordinal}`));
}

const randHandler: FunctionHandler = (_args, context) => nextStream(context)();

const randBetweenHandler: FunctionHandler = (args, context) => {
  const bounds = allRead([numberArg(args, context, 0), numberArg(args, context, 1)]);
  if (!Array.isArray(bounds)) return bounds;
  const [bottom = 0, top = 0] = bounds;
  return randomBetween(bottom, top, nextStream(context)());
};

const randArrayHandler: FunctionHandler = (args, context) => {
  const numbers = allRead([
    optionalNumberArg(args, context, 0, 1),
    optionalNumberArg(args, context, 1, 1),
    optionalNumberArg(args, context, 2, 0),
    optionalNumberArg(args, context, 3, 1),
  ]);
  if (!Array.isArray(numbers)) return numbers;
  const wholeNumbers = booleanArg(args, context, 4);
  if (isSpreadsheetErrorValue(wholeNumbers)) return wholeNumbers;
  const [rows = 1, columns = 1, min = 0, max = 1] = numbers;
  return randomTable(rows, columns, min, max, wholeNumbers, nextStream(context));
};

const RANDOM_FUNCTIONS = [
  {
    name: "RAND",
    handler: randHandler,
    minArgs: 0,
    maxArgs: 0,
    description: "Returns a random number from 0 up to 1, the same at each calculation of the workbook (seeded by the cell)",
    examples: ["RAND()", "RAND() * 100"],
    spills: false,
  },
  {
    name: "RANDBETWEEN",
    handler: randBetweenHandler,
    minArgs: 2,
    maxArgs: 2,
    description: "Returns a random whole number from bottom to top, both included, the same at each calculation (seeded by the cell)",
    examples: ["RANDBETWEEN(1, 6)", "RANDBETWEEN(-10, 10)"],
    spills: false,
  },
  {
    name: "RANDARRAY",
    handler: randArrayHandler,
    minArgs: 0,
    maxArgs: 5,
    description: "Returns a table of random numbers (rows, columns, min, max, whole_number), the same at each calculation (seeded by the cell); spills",
    examples: ["RANDARRAY(5, 2)", "RANDARRAY(10, 1, 1, 6, TRUE)"],
    spills: true,
  },
];

RANDOM_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Mathematical" }));
