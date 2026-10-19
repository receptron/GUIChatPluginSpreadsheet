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
const COMBINING_MARKS = /[̀-ͯ]/g;

interface CollationKey {
  /** One weight per character: its base letter's place, accents and case removed. */
  primary: number[];
  /** The accents of each character, compared only when every primary weight ties. */
  accents: string[];
}

function characterWeight(base: string): number {
  const place = ASCII_ORDER.indexOf(base);
  if (place >= 0) return place;
  // Anything outside the table sorts after it, by its code point.
  return AFTER_ASCII + (base.codePointAt(0) ?? 0);
}

function collationKey(text: string): CollationKey {
  // By code point, so a character outside the BMP is one character and not two halves.
  const characters = Array.from(text).filter((character) => !isIgnorable(character));
  const decomposed = characters.map((character) => character.normalize("NFD"));
  return {
    primary: decomposed.map((parts) => characterWeight(Array.from(parts.replace(COMBINING_MARKS, "").toLowerCase())[0] ?? parts)),
    accents: decomposed.map((parts) => (parts.match(COMBINING_MARKS) ?? []).join("")),
  };
}

function compareSequences<T extends number | string>(left: readonly T[], right: readonly T[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const [a, b] = [left[index], right[index]];
    if (a !== undefined && b !== undefined && a !== b) return a < b ? -1 : 1;
  }
  return left.length - right.length;
}

/** Negative, zero or positive as `left` sorts before, with or after `right`. */
export function compareText(left: string, right: string): number {
  const [leftKey, rightKey] = [collationKey(left), collationKey(right)];
  return compareSequences(leftKey.primary, rightKey.primary) || compareSequences(leftKey.accents, rightKey.accents);
}
