// The seeded generator the generated-input tests share, so a failing case can be
// replayed from the seed it prints.

export type Random = () => number;

const UINT32_RANGE = 4294967296;

/** mulberry32. */
export function seededRandom(seed: number): Random {
  const state = { value: seed >>> 0 };
  return () => {
    state.value = (state.value + 0x6d2b79f5) >>> 0;
    const mixed = Math.imul(state.value ^ (state.value >>> 15), 1 | state.value);
    const scrambled = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((scrambled ^ (scrambled >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

/** One of `items`, chosen by `random`. */
export const pick = <T>(random: Random, items: readonly T[]): T => {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("pick needs at least one item");
  return item;
};
