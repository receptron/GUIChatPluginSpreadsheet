# fix: ROW, COLUMN, ROWS and COLUMNS (#137)

`=ROW()-1` numbering a data sheet gave `#NAME?`, and every `SLOPE` reading that column inherited it.

## Change

- `FunctionContext.currentCell`: the cell whose formula is being calculated, 0-based. The calculator
  keeps the formula cells being calculated as a stack (`cellsBeingCalculated`): a formula that reads
  another formula cell calculates it in between, so the innermost is on top. Another sheet opened
  by a reference has its own stack, so `ROW()` there answers for that sheet's cell.
- `ROW([ref])` / `COLUMN([ref])`: the current cell's number, or the reference's first cell's.
  A range answers for its first cell — this engine returns one value, not Excel's array.
- `ROWS(ref)` / `COLUMNS(ref)`: the size of a reference.
- An argument that is not a reference, and `ROW()` outside a sheet (the evaluator alone), are `#VALUE!`.

## Known difference from Excel

A whole-column reference is bounded to the sheet's data before any function sees it, so
`ROWS(A:A)` counts the data's rows, not 1,048,576.

## Verified by

`tests/engine/test_rowColumn.ts`. Removing the stack's push, its pop, or reading its bottom instead
of its top each turns a test red.
