/**
 * The logical literals `TRUE` and `FALSE` written in a formula, in any case, as the boolean values
 * a logical cell already renders as (`true` / `false`), so a written TRUE and a cell holding TRUE
 * read alike. A function call (`TRUE()`), a sheet name (`TRUE!A1`) and text in quotes are left.
 */

// A double-quoted literal ("" inside it, or a \ escape) or a single-quoted sheet name, each kept as written.
const QUOTED = /("(?:[^"\\]|\\.|"")*"?|'(?:[^']|'')*'?)/;
// The word alone: not part of a longer name or a reference, not a call and not a sheet prefix.
const LOGICAL_WORD = /(?<![\w$.!])(TRUE|FALSE)(?![\w$.]|\s*[(!])/gi;

export function logicalLiteralsAsBooleans(formula: string): string {
  return formula
    .split(QUOTED)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(LOGICAL_WORD, (word) => word.toLowerCase())))
    .join("");
}

// A boolean written alone, perhaps in brackets: `true`, `(false)`.
const LONE_BOOLEAN = /^\(*\s*(true|false)\s*\)*$/;

/** The boolean an expression is when it is nothing but one, or null. */
export function loneBoolean(expr: string): boolean | null {
  const [, word] = expr.trim().match(LONE_BOOLEAN) ?? [];
  return word === undefined ? null : word === "true";
}

/** An expression with its booleans as the numbers arithmetic reads them (TRUE is 1), when it holds
 *  no text that could contain the words. */
export function booleansAsNumbers(expr: string): string {
  return /["']/.test(expr) ? expr : expr.replace(/\btrue\b/g, "1").replace(/\bfalse\b/g, "0");
}
