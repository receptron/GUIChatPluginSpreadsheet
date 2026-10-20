/**
 * RAND, RANDBETWEEN and RANDARRAY over a stream of uniform numbers. The stream is seeded from where
 * the call is — the sheet, the cell, and which call it is in that cell's formula — so a workbook
 * calculates to the same numbers wherever and however often it is calculated: the agent and the
 * page that shows the sheet see one table, not two.
 */

import { fitsInSheet } from "../cellArray";
import { CALC_ERROR, NUM_ERROR, VALUE_ERROR, type SpreadsheetError } from "../spreadsheet-errors";
import type { CellArray } from "../types";

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const UINT32 = 2 ** 32;
const MULBERRY_INCREMENT = 0x6d2b79f5;

/** FNV-1a: a 32-bit hash of `key`. */
export function hashKey(key: string): number {
  return Array.from(key).reduce((hash, char) => Math.imul(hash ^ (char.codePointAt(0) ?? 0), FNV_PRIME) >>> 0, FNV_OFFSET);
}

/** Mulberry32: uniform numbers in [0, 1), one per call, from a 32-bit seed. */
export function uniformStream(seed: number): () => number {
  const state = { value: seed >>> 0 };
  return () => {
    state.value = (state.value + MULBERRY_INCREMENT) >>> 0;
    const mixed = Math.imul(state.value ^ (state.value >>> 15), state.value | 1);
    const spread = (mixed ^ (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61))) >>> 0;
    return ((spread ^ (spread >>> 14)) >>> 0) / UINT32;
  };
}

/** RANDBETWEEN: a whole number from bottom to top, both included; bottom is rounded up and top
 *  down, and nothing between them is #NUM!. */
export function randomBetween(bottom: number, top: number, uniform: number): number | SpreadsheetError {
  const [low, high] = [Math.ceil(bottom), Math.floor(top)];
  return low > high ? NUM_ERROR : low + Math.floor(uniform * (high - low + 1));
}

/** RANDARRAY: a table of uniform numbers from min to max (whole numbers, both included, when
 *  `wholeNumbers`). A size below 0, or past the sheet, and min above max are #VALUE!, as are whole
 *  numbers between bounds that are not whole; a size of 0 is #CALC!, as SEQUENCE's is. */
export function randomTable(rows: number, columns: number, min: number, max: number, wholeNumbers: boolean, next: () => number): CellArray | SpreadsheetError {
  const [height, width] = [Math.trunc(rows), Math.trunc(columns)];
  if (height < 0 || width < 0 || !fitsInSheet(height, width) || min > max) return VALUE_ERROR;
  if (wholeNumbers && (!Number.isInteger(min) || !Number.isInteger(max))) return VALUE_ERROR;
  if (height === 0 || width === 0) return CALC_ERROR;
  const draw = (): number => {
    const uniform = next();
    return wholeNumbers ? min + Math.floor(uniform * (max - min + 1)) : min + uniform * (max - min);
  };
  return Array.from({ length: height }, () => Array.from({ length: width }, draw));
}
