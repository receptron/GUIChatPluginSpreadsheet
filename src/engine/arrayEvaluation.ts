/**
 * An expression over arrays (`A1:A3*2`, `{1,2}+B1:C1`): evaluated element by element, each operand
 * replaced by its element there.
 */

import type { CellValue, FormulaValue } from "./types";
import { isCellArray, normalizedValue } from "./cellArray";
import { alignedIndex, combinedShape, parseArrayConstant, type ArrayOperand, type TableShape } from "./arrayExpression";
import { parseRangeBounds } from "./formulaRefs";
import { indexToColumn } from "./parser";
import { isFormulaError, unknownError } from "./formulaError";
import { isSpreadsheetErrorValue, NA_ERROR, spreadsheetError, type SpreadsheetError } from "./spreadsheet-errors";
import { renderOperand } from "./expressionText";
import type { EvaluatorContext } from "./evaluatorContext";

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

const pieceAt = (table: OperandTable, row: number, col: number): string | SpreadsheetError => {
  const [tableRow, tableCol] = [alignedIndex(table.shape.rows, row), alignedIndex(table.shape.columns, col)];
  return tableRow < 0 || tableCol < 0 ? NA_ERROR : table.elementAt(tableRow, tableCol);
};

/** An expression over arrays, as a table: the largest height and width among its operands, a single
 *  row or column repeated along the other, and #N/A past the end of a shorter operand (Excel). */
export function evaluateOverArrays(formula: string, operands: ArrayOperand[], context: EvaluatorContext): FormulaValue {
  const tables = operands.map((operand) => operandTable(operand, context));
  const shape = combinedShape(tables.map((table) => table.shape));
  const rows = Array.from({ length: shape.rows }, (_, row) =>
    Array.from({ length: shape.columns }, (_cell, col) =>
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
