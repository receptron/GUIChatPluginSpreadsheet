/**
 * References told from their text alone: a bare range (`A1:B3`, `A:A`, `Data!A1:B3`) or a single
 * cell. Which formulas may spill is decided from the text too (arrayExpression.ts).
 */

import { splitSheetReference, UNQUOTED_SHEET_NAME } from "./sheetReference";

const CELL = String.raw`\$?[A-Z]+\$?\d+`;
const CELL_RANGE = new RegExp(`^${CELL}:${CELL}$`, "i");
const SINGLE_CELL = new RegExp(`^${CELL}$`, "i");
const WHOLE_COLUMNS = /^\$?[A-Z]+:\$?[A-Z]+$/i;
const WHOLE_ROWS = /^\$?\d+:\$?\d+$/;
const PLAIN_SHEET_NAME = new RegExp(`^${UNQUOTED_SHEET_NAME}$`, "u");

const isRangeBody = (body: string): boolean => CELL_RANGE.test(body) || WHOLE_COLUMNS.test(body) || WHOLE_ROWS.test(body);

/** The reference part of `text` — after a sheet name that can be written there (`Data!`,
 *  `'My Sheet'!`) — or null when what stands before the `!` is no sheet name (`1+Data!A1`). */
function referenceBody(text: string): string | null {
  if (!text.includes("!")) return text;
  const qualified = splitSheetReference(text);
  if (!qualified) return null;
  return text.startsWith("'") || PLAIN_SHEET_NAME.test(qualified.sheetName) ? qualified.ref : null;
}

/** Whether `text` is nothing but a range reference, perhaps on a named sheet: `A1:B3`, `$A$1:$B$3`,
 *  `A:A`, `1:3`, `Data!A1:B3`, `'My Sheet'!A1:B3`. */
export function isSoleRangeReference(text: string): boolean {
  const body = referenceBody(text.trim());
  return body !== null && isRangeBody(body);
}

/** Whether `text` is nothing but a reference, to a range or to one cell, perhaps on a named sheet. */
export function isSoleReference(text: string): boolean {
  const body = referenceBody(text.trim());
  return body !== null && (isRangeBody(body) || SINGLE_CELL.test(body));
}
