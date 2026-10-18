// Whether a cell reference stands as an operand of `&` all by itself. Excel joins a
// blank cell as "" but computes with it as 0, so a blank `A1` in `=A1&"x"` is "",
// while in `=A1*2&"x"` or `="x"&-A1` it is still a number.

const isSpace = (char: string): boolean => char.trim() === "";

/** The nearest character before `index` that is not a space or `(`, or "" at the start. */
function operatorBefore(expr: string, index: number): string {
  const position = { at: index - 1 };
  while (position.at >= 0 && (isSpace(expr[position.at] ?? "") || expr[position.at] === "(")) position.at -= 1;
  return position.at < 0 ? "" : (expr[position.at] ?? "");
}

/** The nearest character from `index` on that is not a space or `)`, or "" at the end. */
function operatorAfter(expr: string, index: number): string {
  const position = { at: index };
  while (position.at < expr.length && (isSpace(expr[position.at] ?? "") || expr[position.at] === ")")) position.at += 1;
  return position.at >= expr.length ? "" : (expr[position.at] ?? "");
}

/** Whether `expr.slice(start, end)` is a whole operand of a `&`: only brackets and spaces
 *  between it and a `&` on one side, and a `&` or the end of the expression on the other. */
export function standsAloneInConcat(expr: string, start: number, end: number): boolean {
  const before = operatorBefore(expr, start);
  const after = operatorAfter(expr, end);
  const isJoinOrEdge = (char: string): boolean => char === "" || char === "&";
  return isJoinOrEdge(before) && isJoinOrEdge(after) && (before === "&" || after === "&");
}
