/**
 * A blank cell standing alone as one side of a comparison: Excel compares it as whatever the
 * other side is — 0 beside a number, FALSE beside a logical value, "" beside text — where the
 * substitution has already read it as 0.
 */

import type { CellValue } from "./types";

/** What a blank compares as beside `other`. */
export const blankBeside = (other: CellValue): CellValue => {
  if (typeof other === "number") return 0;
  return typeof other === "boolean" ? false : "";
};

/**
 * The comparison's values with each blank side read as `blankBeside` its left neighbour (the
 * right one for the first side). In a chain the left neighbour of a later side is the result so
 * far, a logical value; a neighbour that is blank too compares as it was read.
 */
export function withBlankSides(values: readonly CellValue[], isBlankSide: readonly boolean[]): CellValue[] {
  return values.map((value, index) => {
    if (!isBlankSide[index]) return value;
    if (index === 0) return blankBeside(values[1] ?? 0);
    return index === 1 ? blankBeside(values[0] ?? 0) : false;
  });
}
