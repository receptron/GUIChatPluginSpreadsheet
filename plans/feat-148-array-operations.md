# #148 part 2 — array constants, element-wise operations, SUMPRODUCT

## What
- Array constants: `{1,2,3}` (a row), `{1;2;3}` (a column), `{1,2;3,4}`. Elements are numbers, text, TRUE/FALSE or an error literal.
- An expression whose operands include a range, an array constant or a call that answers a table (`A1:A3*B1:B3`, `A1:A3>2`, `{1,2}&"x"`, `-SORT(A1:A3)`) answers a table, element by element. It spills like any table, and every argument that reads a table reads it (`SUM(A1:A3*B1:B3)`, `INDEX({1,2,3},2)`).
- `SUMPRODUCT(array1, [array2], …)`.

## How
- Text-substitution evaluator, so the element-wise rule reuses it: the formula is evaluated once per element with each array operand replaced by that element. A range element is replaced by **the cell's own reference** (`A1:A3*2` → `A2*2`), so a blank cell, text, a boolean and an error cell answer exactly as a single reference does today. A constant or a table element is written as its value.
- Shape: the largest height and width among the operands. A one-row or one-column operand is repeated along that dimension, and a position past the end of a shorter operand is `#N/A` (Excel).
- An element whose evaluation fails is that element's error; the others still answer.
- What counts as an array operand is decided from the text alone (`arrayExpression.ts`, pure). A call's arguments belong to the call: `SUM(A1:A3)*2` is not an array expression. The calculator's spill candidates and the "may answer a table" check (`isSpillingCall` → `answersTable`) both use it.
- `parseFunctionArgs` does not split on the commas inside `{…}`.

## Not in this part
- Functions that take one value lifting over an array (`ABS(A1:A3)`, `IF(A1:A3>1,…)`): they still answer `#VALUE!` for a table argument, as they do today.
- Arrays returned from workbook (QuickJS) functions: part 3.
