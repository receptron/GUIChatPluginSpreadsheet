# feat: SORT, UNIQUE, SEQUENCE and the other table functions (#150, part 1)

Built on #163 (spill). #150 stays open: FILTER needs element-wise comparison (#148 part 2),
GROUPBY/PIVOTBY a function as an argument (#157), and an array-returning XLOOKUP changes XLOOKUP.

## Functions
SORT, SORTBY, UNIQUE, SEQUENCE, TRANSPOSE, CHOOSECOLS, CHOOSEROWS, HSTACK, VSTACK, TAKE, DROP (all
`spills`), and XMATCH (one value).

## Decisions
- A table argument is a range read as `=A1:B3` reads it (a blank as 0), a spilling call's table, or one
  value as a 1×1 table (an error cell included, so HSTACK keeps it as a cell). `rowsOfRange` in
  cellArray.ts is shared with the evaluator's bare-range path.
- Sort order is Excel's (compareCellValues: numbers, text without regard to case, logical values),
  errors last in either direction; the sort is stable.
- UNIQUE compares cells as `=` does (case-insensitive, by collation identity), grouping in one pass.
- An answer with no cells is `#CALC!` (a new error code), an argument out of range `#VALUE!`.
- XMATCH uses XLOOKUP's match logic, lifted unchanged into `xlookupMatchIndex`.

## Verification
- `tests/engine/test_arrayFunctions.ts`: each function's rules, combinations, and generated properties.
- The differential run of the test corpus against #163's head: every existing formula unchanged.
- A mutation sweep over the new decisions against the whole suite.
