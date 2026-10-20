# #157 — LET, LAMBDA, MAP, BYROW, BYCOL, REDUCE

Stacked on #172 (array constants), which writes a table bound to a name back into the formula.

## How
The evaluator works on text, so a name stands for its value by being written into the formula in its place (`nameBinding.ts`, pure):
- a reference as the reference (`ROW(x)`, a blank cell and `x*2` over a range read as they do);
- any other value as text that reads back as it: a literal, a bracketed number or logical value, an array constant for a table, `{#CODE}` for an error (so it is still an error value, and only where it is used).

A call of a LAMBDA — `LAMBDA(x, x*2)(3)`, or `f(3)` with `f` bound to one — is its body with each parameter replaced by the bracketed argument. Quoted text, sheet names and function names are left alone, and so is a nested LET or LAMBDA from where it binds the same name again (a LET's own value for that name still reads the outer one).

MAP, BYROW and BYCOL give a range's elements, rows and columns as references (`A2`, `A2:C2`), and a computed table's as array constants. MAP lines its arrays up as `A1:A3+B1:B3` does.

## Decisions
- REDUCE with the initial value left out starts from 0. Microsoft's page says "the first value in the array", but its own example (`REDUCE(, A1:C2, LAMBDA(a,b,a+b^2))`, "sum squared values") only holds from 0.
- An answer that is a table where one value is wanted (each element of MAP, each line of BYROW/BYCOL) is #CALC!; an uncalled LAMBDA is #CALC!; wrong argument counts are #VALUE!; a name Excel refuses (cell-like, TRUE/FALSE, R, C) is #NAME?.
- A recursive LAMBDA (named in Excel's Name Manager) is not supported: there is no workbook-level name.
