/**
 * Comparing text the way Excel sorts it, without depending on the runtime's ICU: the browser
 * and the server both calculate a sheet, and a collation that varies with the ICU build could
 * answer one comparison two ways. Case is ignored and accents count, as in Intl.Collator("en",
 * { sensitivity: "accent" }), whose order on ASCII this reproduces.
 */

// ICU's English order for printable ASCII with letters folded to lower case: punctuation and
// symbols, then digits, then letters. Measured from Intl.Collator("en").
const ASCII_ORDER = "\t\n\u000b\u000c\r _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789abcdefghijklmnopqrstuvwxyz";
const AFTER_ASCII = ASCII_ORDER.length;
const LAST_C0_BEFORE_TAB = 0x08;
const FIRST_C0_AFTER_CR = 0x0e;
const LAST_C0 = 0x1f;
const DELETE = 0x7f;

/** The C0 controls and DEL that are not in the table; ICU ignores them, and so does this. */
function isIgnorable(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code <= LAST_C0_BEFORE_TAB || (code >= FIRST_C0_AFTER_CR && code <= LAST_C0) || code === DELETE;
}
const COMBINING_MARK = /^[\u0300-\u036f]$/u;

// ICU's English order for the combining marks U+0300–U+0362, as measured from Intl.Collator("en"):
// one entry per rank, marks that compare equal sharing an entry. The first rank (U+034F, the
// grapheme joiner) is ignorable. An accent compares by these ranks, not by code point, so á
// sorts before à as it does there.
const MARK_RANKS: readonly string[] = [
  "34f",
  "332",
  "313 343",
  "314",
  "301 341",
  "300 340",
  "306",
  "302",
  "30c",
  "30a",
  "342",
  "308",
  "344",
  "30b",
  "303",
  "307",
  "338",
  "327",
  "328",
  "304",
  "30d 30e 312 315 31a 33d 33e 33f 346 34a 34b 34c 350 351 352 357 35b 35d 35e",
  "316 317 318 319 31c 31d 31e 31f 320 329 32a 32b 32c 32f 333 33a 33b 33c 347 348 349 34d 34e 353 354 355 356 359 35a 35c 35f 362",
  "336 337",
  "335",
  "305",
  "309",
  "30f",
  "310",
  "311",
  "31b",
  "321",
  "322",
  "323",
  "324",
  "325",
  "326",
  "32d",
  "32e",
  "330",
  "331",
  "334",
  "339",
  "345",
  "358",
  "360",
  "361",
];
const IGNORABLE_MARK_RANK = 0;
// U+0363–U+036F are small letters written above another; ICU weighs each as the letter itself.
const SUPERSCRIPT_LETTERS = "aeioucdhmrtvx";
const FIRST_SUPERSCRIPT_LETTER = 0x363;
const asLetter = (character: string): string => SUPERSCRIPT_LETTERS.charAt((character.codePointAt(0) ?? 0) - FIRST_SUPERSCRIPT_LETTER) || character;
const MARK_RANK = new Map<string, number>(
  MARK_RANKS.flatMap((group, rank) => group.split(" ").map((hex): [string, number] => [String.fromCodePoint(Number.parseInt(hex, 16)), rank])),
);

interface CollationKey {
  /** One weight per character: its base letter's place, accents and case removed. */
  primary: number[];
  /** The ranks of each character's accents, compared only when every primary weight ties. */
  accents: number[][];
}

function characterWeight(base: string): number {
  const place = ASCII_ORDER.indexOf(base);
  if (place >= 0) return place;
  // Anything outside the table sorts after it, by its code point.
  return AFTER_ASCII + (base.codePointAt(0) ?? 0);
}

function collationKey(text: string): CollationKey {
  // The whole text is decomposed first, so a composed é and an e followed by U+0301 are the same
  // base letter and accent. Each base character then takes the combining marks after it.
  const key: CollationKey = { primary: [], accents: [] };
  Array.from(text.normalize("NFD"))
    .filter((character) => !isIgnorable(character))
    .map(asLetter)
    .forEach((character) => {
      const accentsSoFar = key.accents.at(-1);
      if (COMBINING_MARK.test(character) && accentsSoFar !== undefined) {
        const rank = MARK_RANK.get(character) ?? IGNORABLE_MARK_RANK;
        if (rank !== IGNORABLE_MARK_RANK) accentsSoFar.push(rank);
        return;
      }
      key.primary.push(characterWeight(character.toLowerCase()));
      key.accents.push([]);
    });
  return key;
}

function compareSequences<T extends number | string>(left: readonly T[], right: readonly T[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const [a, b] = [left[index], right[index]];
    if (a !== undefined && b !== undefined && a !== b) return a < b ? -1 : 1;
  }
  return left.length - right.length;
}

/** Character by character, the first that differs in its accents decides. Called once the primary weights tie, so both hold one entry per character. */
function compareAccents(left: readonly number[][], right: readonly number[][]): number {
  return left.reduce((decided, accents, index) => decided || compareSequences(accents, right[index] ?? []), 0);
}

/** Negative, zero or positive as `left` sorts before, with or after `right`. */
export function compareText(left: string, right: string): number {
  const [leftKey, rightKey] = [collationKey(left), collationKey(right)];
  return compareSequences(leftKey.primary, rightKey.primary) || compareAccents(leftKey.accents, rightKey.accents);
}
