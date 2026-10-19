/**
 * Reading the sheet out of a sheet-qualified reference: `Data!A1`, `'My Sheet'!A1:B2`, and a
 * quoted name holding an apostrophe written twice, as Excel writes it (`'It''s'!A1` names It's).
 */

// The sheet name (quoted, with `''` inside, or plain), then `!` and the reference.
const SHEET_QUALIFIED_REF = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/;

/** A reference split from the sheet it names. */
export interface SheetQualifiedReference {
  sheetName: string;
  ref: string;
}

/** The sheet a reference names and the reference within it, or null when it names no sheet. */
export function splitSheetReference(fullRef: string): SheetQualifiedReference | null {
  const [, quotedName, plainName, ref] = fullRef.match(SHEET_QUALIFIED_REF) ?? [];
  const sheetName = quotedName === undefined ? plainName : quotedName.replace(/''/g, "'");
  return sheetName === undefined || ref === undefined ? null : { sheetName, ref };
}

/** The index just past the closing quote of the sheet name that opens at `start` (a `'`), a
 *  doubled `''` inside it read as part of the name; -1 when the name never closes. */
export function endOfQuotedSheetName(text: string, start: number): number {
  const close = text.indexOf("'", start + 1);
  if (close === -1) return -1;
  return text[close + 1] === "'" ? endOfQuotedSheetName(text, close + 1) : close + 1;
}
