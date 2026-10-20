/**
 * The functions that answer a table and spill it: SORT, SORTBY, UNIQUE, SEQUENCE, TRANSPOSE,
 * CHOOSECOLS, CHOOSEROWS, HSTACK, VSTACK, TAKE and DROP. A table argument is a range (each cell
 * as `=A1` reads it, a blank as 0), a call that answers a table, or a single value as a 1×1 table.
 * The rules live in array-functions-math.ts.
 */

import { functionRegistry, type FunctionHandler } from "../registry";
import { isSpreadsheetErrorValue } from "../spreadsheet-errors";
import type { CellArray } from "../types";
import { allRead, booleanArg, numberArg, optionalCountArg, optionalNumberArg, tableArg, type Read } from "./table-args";
import {
  chooseColumns,
  chooseRows,
  dropFrom,
  sequence,
  sortTable,
  sortTableBy,
  stackHorizontally,
  stackVertically,
  takeFrom,
  transpose,
  uniqueTable,
  type ByArray,
} from "./array-functions-math";

const MAX_ARGS = 255;
const ASCENDING = 1;

const sortHandler: FunctionHandler = (args, context) => {
  const table = tableArg(args, context, 0);
  const numbers = allRead([optionalNumberArg(args, context, 1, 1), optionalNumberArg(args, context, 2, ASCENDING)]);
  if (!Array.isArray(numbers)) return numbers;
  const byColumn = booleanArg(args, context, 3);
  if (typeof byColumn !== "boolean") return byColumn;
  const [index = 1, order = ASCENDING] = numbers;
  return sortTable(table, index, order, byColumn);
};

/** SORTBY(array, by_array1, [order1], by_array2, [order2], …). */
const sortByHandler: FunctionHandler = (args, context) => {
  const table = tableArg(args, context, 0);
  const pairStarts = Array.from({ length: Math.ceil((args.length - 1) / 2) }, (_, pair) => 1 + pair * 2);
  const keys = pairStarts.map((start): Read<ByArray> => {
    const key = tableArg(args, context, start);
    const order = optionalNumberArg(args, context, start + 1, ASCENDING);
    return typeof order === "number" ? { table: key, order } : order;
  });
  const read = allRead(keys);
  return Array.isArray(read) ? sortTableBy(table, read) : read;
};

const uniqueHandler: FunctionHandler = (args, context) => {
  const table = tableArg(args, context, 0);
  const flags = allRead([booleanArg(args, context, 1), booleanArg(args, context, 2)]);
  if (!Array.isArray(flags)) return flags;
  const [byColumn = false, exactlyOnce = false] = flags;
  return uniqueTable(table, byColumn, exactlyOnce);
};

const sequenceHandler: FunctionHandler = (args, context) => {
  const numbers = allRead([
    numberArg(args, context, 0),
    optionalNumberArg(args, context, 1, 1),
    optionalNumberArg(args, context, 2, 1),
    optionalNumberArg(args, context, 3, 1),
  ]);
  if (!Array.isArray(numbers)) return numbers;
  const [rows = 1, columns = 1, start = 1, step = 1] = numbers;
  return sequence(rows, columns, start, step);
};

const transposeHandler: FunctionHandler = (args, context) => {
  return transpose(tableArg(args, context, 0));
};

/** CHOOSEROWS / CHOOSECOLS(array, num1, …). */
const chooseHandler =
  (choose: (table: CellArray, picks: number[]) => Read<CellArray>): FunctionHandler =>
  (args, context) => {
    const table = tableArg(args, context, 0);
    const picks = allRead(args.slice(1).map((_, offset) => numberArg(args, context, offset + 1)));
    return Array.isArray(picks) ? choose(table, picks) : picks;
  };

const stackHandler =
  (stack: (tables: CellArray[]) => CellArray): FunctionHandler =>
  (args, context) =>
    stack(args.map((_, index) => tableArg(args, context, index)));

/** TAKE / DROP(array, rows, [columns]). */
const sliceHandler =
  (slice: (table: CellArray, rows: number | undefined, columns: number | undefined) => Read<CellArray>): FunctionHandler =>
  (args, context) => {
    const table = tableArg(args, context, 0);
    const [rows, columns] = [optionalCountArg(args, context, 1), optionalCountArg(args, context, 2)];
    if (isSpreadsheetErrorValue(rows)) return rows;
    if (isSpreadsheetErrorValue(columns)) return columns;
    return slice(table, rows, columns);
  };

interface ArrayFunction {
  name: string;
  handler: FunctionHandler;
  minArgs: number;
  maxArgs: number;
  description: string;
  examples: string[];
  category: string;
}

const LOOKUP = "Lookup & Reference";

const ARRAY_FUNCTIONS: ArrayFunction[] = [
  {
    name: "SORT",
    handler: sortHandler,
    minArgs: 1,
    maxArgs: 4,
    description: "Sorts a range by one of its columns (or rows), ascending (1) or descending (-1); spills",
    examples: ["SORT(A2:C20)", "SORT(A2:C20, 3, -1)"],
    category: LOOKUP,
  },
  {
    name: "SORTBY",
    handler: sortByHandler,
    minArgs: 2,
    maxArgs: MAX_ARGS,
    description: "Sorts a range by other ranges of the same height, each ascending (1) or descending (-1); spills",
    examples: ["SORTBY(A2:B20, C2:C20, -1)"],
    category: LOOKUP,
  },
  {
    name: "UNIQUE",
    handler: uniqueHandler,
    minArgs: 1,
    maxArgs: 3,
    description: "Returns the distinct rows (or columns) of a range, or those that occur exactly once; spills",
    examples: ["UNIQUE(A2:A100)", "UNIQUE(A2:B100, FALSE, TRUE)"],
    category: LOOKUP,
  },
  {
    name: "SEQUENCE",
    handler: sequenceHandler,
    minArgs: 1,
    maxArgs: 4,
    description: "Returns rows × columns of numbers from start, step apart; spills",
    examples: ["SEQUENCE(10)", "SEQUENCE(3, 4, 0, 5)"],
    category: "Mathematical",
  },
  {
    name: "TRANSPOSE",
    handler: transposeHandler,
    minArgs: 1,
    maxArgs: 1,
    description: "Turns a range's rows into columns; spills",
    examples: ["TRANSPOSE(A1:C2)"],
    category: LOOKUP,
  },
  {
    name: "CHOOSECOLS",
    handler: chooseHandler(chooseColumns),
    minArgs: 2,
    maxArgs: MAX_ARGS,
    description: "Returns the given columns of a range (negative counts from the end); spills",
    examples: ["CHOOSECOLS(A2:E20, 1, 3)"],
    category: LOOKUP,
  },
  {
    name: "CHOOSEROWS",
    handler: chooseHandler(chooseRows),
    minArgs: 2,
    maxArgs: MAX_ARGS,
    description: "Returns the given rows of a range (negative counts from the end); spills",
    examples: ["CHOOSEROWS(A2:E20, 1, -1)"],
    category: LOOKUP,
  },
  {
    name: "HSTACK",
    handler: stackHandler(stackHorizontally),
    minArgs: 1,
    maxArgs: MAX_ARGS,
    description: "Puts ranges side by side, a shorter one filled with #N/A; spills",
    examples: ["HSTACK(A2:A10, C2:C10)"],
    category: LOOKUP,
  },
  {
    name: "VSTACK",
    handler: stackHandler(stackVertically),
    minArgs: 1,
    maxArgs: MAX_ARGS,
    description: "Puts ranges one under another, a narrower one filled with #N/A; spills",
    examples: ["VSTACK(A2:C5, A10:C12)"],
    category: LOOKUP,
  },
  {
    name: "TAKE",
    handler: sliceHandler(takeFrom),
    minArgs: 2,
    maxArgs: 3,
    description: "Returns the first (or, negative, the last) rows and columns of a range; spills",
    examples: ["TAKE(A2:C20, 5)", "TAKE(A2:C20, -3, 2)"],
    category: LOOKUP,
  },
  {
    name: "DROP",
    handler: sliceHandler(dropFrom),
    minArgs: 2,
    maxArgs: 3,
    description: "Returns a range without its first (or, negative, its last) rows and columns; spills",
    examples: ["DROP(A1:C20, 1)"],
    category: LOOKUP,
  },
];

ARRAY_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, spills: true }));
