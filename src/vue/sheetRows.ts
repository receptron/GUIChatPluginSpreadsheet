// A sheet's rows as the editors read them from the JSON they edit.

import { isObj } from "../engine/guards";

/**
 * Normalize malformed data structures
 * Some models generate flat arrays instead of 2D arrays - fix them
 */
export function normalizeSheetData(data: unknown): unknown[][] {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  // If data is already a 2D array, return as-is
  if (Array.isArray(data[0])) {
    return data;
  }

  // If data is a flat array of cell objects, convert to 2D by pairing cells
  // Pattern: [cell1, cell2, cell3, cell4] -> [[cell1, cell2], [cell3, cell4]]
  if (isObj(data[0])) {
    const rows: unknown[][] = [];
    for (let i = 0; i < data.length; i += 2) {
      const row = [data[i]];
      if (i + 1 < data.length) {
        row.push(data[i + 1]);
      }
      rows.push(row);
    }
    return rows;
  }

  // Unknown structure - return empty
  return [];
}
