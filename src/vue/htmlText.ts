// Small DOM-free helpers the View needs around its `v-html` table.

const HTML_ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

/** A link in a cell that should open in a new tab rather than navigate the
 *  host app away: http(s) on another origin. */
export function isCrossOriginHttpUrl(href: string, currentOrigin: string): boolean {
  if (!href.startsWith("http://") && !href.startsWith("https://")) return false;
  try {
    return new URL(href).origin !== currentOrigin;
  } catch {
    return false;
  }
}
