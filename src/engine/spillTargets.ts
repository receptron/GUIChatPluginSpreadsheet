// The cells a table fills when it spills from a formula's cell, to the right and down.

import type { CellCoordinates } from "./registry";
import type { CellArray, CellValue } from "./types";

export interface SpillTarget {
  row: number;
  col: number;
  value: CellValue;
}

/** Every cell `table` fills from `anchor`, the anchor itself left out: it holds the formula. */
export const spillTargets = (anchor: CellCoordinates, table: CellArray): SpillTarget[] =>
  table.flatMap((cells, rowOffset) =>
    cells.flatMap((value, colOffset) => (rowOffset === 0 && colOffset === 0 ? [] : [{ row: anchor.row + rowOffset, col: anchor.col + colOffset, value }])),
  );
