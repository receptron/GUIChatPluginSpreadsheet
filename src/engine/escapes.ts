/**
 * Whether the character at `index` is backslash-escaped: preceded by an ODD run of
 * backslashes. Checking only the one character before it is wrong for a literal
 * ending in a backslash, `"a\\"`, where the closing quote follows an escaped
 * backslash and does close the literal. Counts backwards over the run only, so a
 * scan over a long text stays linear.
 */
export function isEscapedAt(text: string, index: number): boolean {
  const runStart = (position: number): number => (position > 0 && text[position - 1] === "\\" ? runStart(position - 1) : position);
  return (index - runStart(index)) % 2 === 1;
}
