/**
 * GROUPBY and PIVOTBY. The function argument is a function's name (SUM, AVERAGE, COUNT, …) or a
 * LAMBDA of one parameter, given each group's values as a column (let-lambda.ts). The layout rules
 * live in group-by-math.ts.
 */

import { functionRegistry, requiredArg, type FunctionContext, type FunctionHandler } from "../registry";
import { isSpreadsheetErrorValue, VALUE_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import type { CellArray, CellValue } from "../types";
import { groupByTable, pivotTable } from "./group-by-math";
import { aggregatorFor } from "./let-lambda";
import { optionalNumberArg, tableArg } from "./table-args";

const isLeftOut = (args: string[], index: number): boolean => (args[index]?.trim() ?? "") === "";

/** field_headers: 0 none, 1 there and hidden, 2 not there and made up, 3 there and shown; left out,
 *  there when the first value is text and the second a number. */
function headerMode(args: string[], context: FunctionContext, index: number, values: CellArray): number | SpreadsheetError {
  if (isLeftOut(args, index)) return typeof values[0]?.[0] === "string" && typeof values[1]?.[0] === "number" ? 3 : 0;
  const mode = optionalNumberArg(args, context, index, 0);
  if (typeof mode !== "number") return mode;
  return [0, 1, 2, 3].includes(mode) ? mode : VALUE_ERROR;
}

/** The numbers of a sort_order argument (one, or an array of them), each a column of the answer;
 *  left out, each key column ascending in turn. */
function sortOrderArg(args: string[], context: FunctionContext, index: number, width: number, keyWidth: number): number[] | SpreadsheetError {
  if (isLeftOut(args, index)) return Array.from({ length: Math.max(keyWidth, 1) }, (_, col) => col + 1);
  const cells = tableArg(args, context, index).flat();
  const error = cells.find(isSpreadsheetErrorValue);
  if (error) return error;
  const orders = cells.map((cell) => (typeof cell === "number" ? Math.trunc(cell) : 0));
  return orders.every((order) => order !== 0 && Math.abs(order) <= width) ? orders : VALUE_ERROR;
}

/** Which data rows a filter_array keeps: TRUE, or a number other than 0, for each; all when it is left out. */
function includedRows(args: string[], context: FunctionContext, index: number, height: number): boolean[] | SpreadsheetError {
  if (isLeftOut(args, index)) return Array.from({ length: height }, () => true);
  const cells = tableArg(args, context, index).flat();
  if (cells.length !== height) return VALUE_ERROR;
  const error = cells.find(isSpreadsheetErrorValue);
  if (error) return error;
  return cells.every((cell) => typeof cell === "boolean" || typeof cell === "number")
    ? cells.map((cell) => cell === true || (typeof cell === "number" && cell !== 0))
    : VALUE_ERROR;
}

/** A table argument, or #VALUE! when it does not have `height` rows. */
function tableOfHeight(args: string[], context: FunctionContext, index: number, height: number): CellArray | SpreadsheetError {
  const table = tableArg(args, context, index);
  return table.length === height ? table : VALUE_ERROR;
}

/** The data without its header row when there is one, and the header cells. */
const split = (table: CellArray, hasHeaders: boolean): { data: CellArray; header: CellValue[] } =>
  hasHeaders ? { data: table.slice(1), header: table[0] ?? [] } : { data: table, header: [] };

// GROUPBY(row_fields, values, function, [field_headers], [total_depth], [sort_order], [filter_array], [field_relationship])
const groupByHandler: FunctionHandler = (args, context) => {
  const keysTable = tableArg(args, context, 0);
  const valuesTable = tableOfHeight(args, context, 1, keysTable.length);
  if (isSpreadsheetErrorValue(valuesTable)) return valuesTable;
  const aggregate = aggregatorFor(requiredArg(context, args, 2), context);
  const mode = headerMode(args, context, 3, valuesTable);
  if (isSpreadsheetErrorValue(aggregate) || isSpreadsheetErrorValue(mode)) return VALUE_ERROR;
  if (!isLeftOut(args, 7)) return VALUE_ERROR;
  const keys = split(keysTable, mode === 1 || mode === 3);
  const values = split(valuesTable, mode === 1 || mode === 3);
  const keyWidth = keys.data[0]?.length ?? 0;
  const width = keyWidth + (values.data[0]?.length ?? 0);
  const totalDepth = optionalNumberArg(args, context, 4, keyWidth >= 2 ? 2 : 1);
  const sortOrder = sortOrderArg(args, context, 5, width, keyWidth);
  const included = includedRows(args, context, 6, keys.data.length);
  if (typeof totalDepth !== "number" || isSpreadsheetErrorValue(sortOrder) || isSpreadsheetErrorValue(included)) {
    return [totalDepth, sortOrder, included].find(isSpreadsheetErrorValue) ?? VALUE_ERROR;
  }
  const generated = (prefix: string, count: number): CellValue[] => Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);
  const headers =
    mode === 3 ? [...keys.header, ...values.header] : mode === 2 ? [...generated("Row Field", keyWidth), ...generated("Value", width - keyWidth)] : null;
  return groupByTable(keys.data, values.data, included, aggregate, { headers, totalDepth: Math.trunc(totalDepth), sortOrder });
};

// PIVOTBY(row_fields, col_fields, values, function, [field_headers], [row_total_depth], [row_sort_order],
// [col_total_depth], [col_sort_order], [filter_array], [relative_to]) — one values column.
const pivotByHandler: FunctionHandler = (args, context) => {
  const rowKeysTable = tableArg(args, context, 0);
  const height = rowKeysTable.length;
  const columnKeysTable = tableOfHeight(args, context, 1, height);
  const valuesTable = tableOfHeight(args, context, 2, height);
  if (isSpreadsheetErrorValue(columnKeysTable) || isSpreadsheetErrorValue(valuesTable)) return VALUE_ERROR;
  const aggregate = aggregatorFor(requiredArg(context, args, 3), context);
  const mode = headerMode(args, context, 4, valuesTable);
  if (isSpreadsheetErrorValue(aggregate) || isSpreadsheetErrorValue(mode) || (valuesTable[0]?.length ?? 0) !== 1 || !isLeftOut(args, 10)) return VALUE_ERROR;
  const hasHeaders = mode === 1 || mode === 3;
  const [rowKeys, columnKeys, values] = [rowKeysTable, columnKeysTable, valuesTable].map((table) => split(table, hasHeaders).data);
  const rowWidth = rowKeys?.[0]?.length ?? 0;
  const columnDepth = columnKeys?.[0]?.length ?? 0;
  const rowTotals = optionalNumberArg(args, context, 5, 1);
  const rowSortOrder = sortOrderArg(args, context, 6, rowWidth, rowWidth);
  const columnTotals = optionalNumberArg(args, context, 7, 1);
  const columnSortOrder = sortOrderArg(args, context, 8, columnDepth, columnDepth);
  const included = includedRows(args, context, 9, rowKeys?.length ?? 0);
  const read = [rowTotals, rowSortOrder, columnTotals, columnSortOrder, included];
  const error = read.find(isSpreadsheetErrorValue);
  if (error) return error;
  if (
    typeof rowTotals !== "number" ||
    typeof columnTotals !== "number" ||
    !Array.isArray(rowSortOrder) ||
    !Array.isArray(columnSortOrder) ||
    !Array.isArray(included)
  )
    return VALUE_ERROR;
  return pivotTable(rowKeys ?? [], columnKeys ?? [], values ?? [], included, aggregate, {
    rowTotals: Math.sign(Math.trunc(rowTotals)),
    columnTotals: Math.sign(Math.trunc(columnTotals)),
    rowSortOrder,
    columnSortOrder,
  });
};

const GROUP_FUNCTIONS = [
  {
    name: "GROUPBY",
    handler: groupByHandler,
    minArgs: 3,
    maxArgs: 8,
    description:
      "Groups rows by row_fields and aggregates values for each group with a function (SUM, AVERAGE, … or a LAMBDA), sorted, with a Total row (subtotals for two key columns or more); spills",
    examples: ["GROUPBY(A2:A100, C2:C100, SUM)", "GROUPBY(A1:B100, C1:C100, AVERAGE, 3, 2, -3)"],
  },
  {
    name: "PIVOTBY",
    handler: pivotByHandler,
    minArgs: 4,
    maxArgs: 11,
    description: "Aggregates one values column by row_fields down the side and col_fields across the top, with Total rows and columns; spills",
    examples: ["PIVOTBY(A2:A100, B2:B100, C2:C100, SUM)", "PIVOTBY(A1:A100, B1:B100, C1:C100, COUNT, 3, 0)"],
  },
];

GROUP_FUNCTIONS.forEach((definition) => functionRegistry.register({ ...definition, category: "Lookup & Reference", spills: true }));
