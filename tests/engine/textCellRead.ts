// Shared by the specs that put one text in A1 and read what formulas beside it make of it.

import { calculateSheet, type SheetData } from "../../src/engine/index.ts";

/** The raw calculated values of `formulas`, written in B1, C1, … beside `text` in A1. */
export const readBeside = (text: string, formulas: string[]): unknown[] => {
  const sheet: SheetData = { name: "S", data: [[text, ...formulas].map((v) => ({ v }))] };
  return calculateSheet(sheet, [sheet], { skipFormatting: true }).data[0]?.slice(1) ?? [];
};

/** A repeatable random sequence in [0, 1): the same seed replays a generated run. */
export const seededRandom = (seed: number): (() => number) => {
  let state = seed;
  return (): number => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
};
