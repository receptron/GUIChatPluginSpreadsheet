// A name for a workbook file's exact content, so a save can tell whether the file
// is still the one its View read.

const DIGEST_ALGORITHM = "SHA-256";
const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;

/** The SHA-256 of `text`, in hex. Two texts get the same version only when they are equal. */
export async function contentVersion(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(DIGEST_ALGORITHM, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, "0")).join("");
}

/** Whether a save based on `baseVersion` must not be written over a file now at `currentVersion`.
 *  A save without a base (an older View) and a file that is gone are written as before. */
export const isStaleBase = (baseVersion: string | undefined, currentVersion: string | null): boolean =>
  baseVersion !== undefined && currentVersion !== null && baseVersion !== currentVersion;
