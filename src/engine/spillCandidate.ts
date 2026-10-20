/**
 * Which formulas may spill, decided from their text alone: a bare range reference (`=A1:B3`), or a
 * call, at the formula's top level, to a function that may return an array. Being decidable before
 * anything is calculated is the point: a read of an empty cell calculates the candidates that could
 * spill into it first, and no other formula is calculated out of turn.
 */

import { topLevelGroups } from "./concatPrecedence";
import { splitSheetReference, UNQUOTED_SHEET_NAME } from "./sheetReference";

const CELL = String.raw`\$?[A-Z]+\$?\d+`;
const CELL_RANGE = new RegExp(`^${CELL}:${CELL}$`, "i");
const SINGLE_CELL = new RegExp(`^${CELL}$`, "i");
const WHOLE_COLUMNS = /^\$?[A-Z]+:\$?[A-Z]+$/i;
const WHOLE_ROWS = /^\$?\d+:\$?\d+$/;
const PLAIN_SHEET_NAME = new RegExp(`^${UNQUOTED_SHEET_NAME}$`, "u");
const CALL_NAME = /^([A-Za-z_][\w.]*)\(/;

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

/** The function `text` calls when it is one call and nothing more (`SORT(A1:A9)`), or null. */
export function soleCallName(text: string): string | null {
  const trimmed = text.trim();
  const name = CALL_NAME.exec(trimmed)?.[1];
  if (name === undefined) return null;
  const [group] = topLevelGroups(trimmed);
  return group?.open === name.length && group.close === trimmed.length - 1 ? name : null;
}

/** Whether the formula `body` (without its `=`) may spill, given which functions may return an array. */
export function maySpill(body: string, returnsArray: (functionName: string) => boolean): boolean {
  if (isSoleRangeReference(body)) return true;
  const name = soleCallName(body);
  return name !== null && returnsArray(name);
}
