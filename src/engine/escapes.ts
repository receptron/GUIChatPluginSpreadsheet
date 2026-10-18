/**
 * Whether the character at `index` is backslash-escaped: preceded by an ODD run of
 * backslashes. Checking only the one character before it is wrong for a literal
 * ending in a backslash, `"a\\"`, where the closing quote follows an escaped
 * backslash and does close the literal.
 *
 * Counts backwards over the run only. Scanners ask it about quote characters
 * alone, so a long text of backslashes is walked once per following quote.
 */
export function isEscapedAt(text: string, index: number): boolean {
  const state = { position: index };
  while (state.position > 0 && text[state.position - 1] === "\\") state.position -= 1;
  return (index - state.position) % 2 === 1;
}
