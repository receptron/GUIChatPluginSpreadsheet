/**
 * Where a reference written as a function argument points: `A5`, `$B$3`, `Data!C2:D9`.
 */

import { parseRangeBounds, type RangeBounds } from "../formulaRefs";

/** The bounds of a cell or range reference, or null when the argument is not one. A single cell
 *  is read as the one-cell range it is, so `ROW(A5)` and `ROW(A5:A9)` share one parse. */
export function referenceBounds(arg: string): RangeBounds | null {
  const reference = arg.trim();
  if (reference.includes(":")) return parseRangeBounds(reference);
  const cell = reference.slice(reference.lastIndexOf("!") + 1);
  return parseRangeBounds(`${reference}:${cell}`);
}
