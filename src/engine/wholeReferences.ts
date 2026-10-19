/**
 * Whole-column (`A:A`, `B:D`) and whole-row (`1:1`, `2:5`) references, rewritten as the bounded
 * range they cover in their sheet: `A:A` becomes `A1:A<last row>`, `1:1` becomes
 * `A1:<last column>1`. Everything past a sheet's data is blank, so the answers are Excel's, and
 * every reader downstream (ranges, lookups, argument checks) sees an ordinary `A1:B2` range.
 */

import { columnToIndex, indexToColumn } from "./parser";

/** How far a sheet's data reaches: the number of rows, and the longest row's length. */
export interface SheetExtent {
  rows: number;
  columns: number;
}

/** The extent of the sheet a reference names (`null` for the formula's own sheet), or null when there is no such sheet. */
export type ExtentOf = (sheetName: string | null) => SheetExtent | null;

// An optional sheet prefix (`Data!`, `'My Sheet'!`), then two column letters or two row
// numbers joined by a colon. The lookbehind keeps `A1:B2` and `Data!A:A` from matching from
// their middle; the lookahead keeps a function name or a longer token out.
const SHEET_PREFIX = String.raw`(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))!`;
const WHOLE_REFERENCE = new RegExp(String.raw`(?<![\w$.'!])(?:${SHEET_PREFIX})?(?:(\$?[A-Za-z]{1,3}):(\$?[A-Za-z]{1,3})|(\$?\d+):(\$?\d+))(?![\w.(!:])`, "g");

const withoutAnchor = (part: string): string => part.replace("$", "").toUpperCase();

/** The two ends in order, as Excel reads `B:A` as `A:B` and `5:2` as `2:5`. */
const inOrder = ([first, last]: [string, string], place: (end: string) => number): [string, string] => {
  const ends: [string, string] = [withoutAnchor(first), withoutAnchor(last)];
  return place(ends[0]) <= place(ends[1]) ? ends : [ends[1], ends[0]];
};

interface WholeReference {
  whole: string;
  sheetName: string | null;
  columns?: [string, string];
  rows?: [string, string];
}

/** The bounded form of one whole reference, or null when its sheet does not exist. */
function boundedReference({ whole, sheetName, columns, rows }: WholeReference, extentOf: ExtentOf): string | null {
  const extent = extentOf(sheetName);
  if (!extent) return null;
  const prefix = whole.slice(0, whole.lastIndexOf("!") + 1);
  // An empty sheet still has its first row and column, so the range is never inverted.
  const lastRowNumber = Math.max(extent.rows, 1);
  if (columns) {
    const [firstColumn, lastColumn] = inOrder(columns, columnToIndex);
    return `${prefix}${firstColumn}1:${lastColumn}${lastRowNumber}`;
  }
  const lastColumnLetter = indexToColumn(Math.max(extent.columns, 1) - 1);
  const [firstRow, lastRow] = inOrder(rows ?? ["1", "1"], Number);
  return `${prefix}A${firstRow}:${lastColumnLetter}${lastRow}`;
}

/** Each whole reference outside a string literal, rewritten as its bounded range. */
function boundOutsideLiterals(code: string, extentOf: ExtentOf): string {
  return code.replace(
    WHOLE_REFERENCE,
    (whole: string, quotedSheet?: string, plainSheet?: string, firstColumn?: string, lastColumn?: string, firstRow?: string, lastRow?: string) => {
      const sheetName = quotedSheet?.replace(/''/g, "'") ?? plainSheet ?? null;
      const columns: [string, string] | undefined = firstColumn && lastColumn ? [firstColumn, lastColumn] : undefined;
      const rows: [string, string] | undefined = firstRow && lastRow ? [firstRow, lastRow] : undefined;
      return boundedReference({ whole, sheetName, columns, rows }, extentOf) ?? whole;
    },
  );
}

/**
 * The formula with every whole-column and whole-row reference bounded to its sheet's data. Text
 * inside a string literal (`"A:A"`) is left as written. A reference to a sheet that does not
 * exist is left as written too, so it fails as any reference to that sheet does.
 */
export function boundWholeReferences(formula: string, extentOf: ExtentOf): string {
  // Splitting on the literal pattern keeps each literal at an odd index, with "" inside one. A
  // quote that never closes runs to the end, so text after it is never read as a reference.
  const parts = formula.split(/("(?:[^"]|"")*(?:"|$))/);
  return parts.map((part, index) => (index % 2 === 1 ? part : boundOutsideLiterals(part, extentOf))).join("");
}
