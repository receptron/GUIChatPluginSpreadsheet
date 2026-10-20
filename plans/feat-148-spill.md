# feat: array results that spill, and range reads that keep their shape (#148, part 1)

#148 is split into PRs that can be reverted on their own:
1. **this one** — a function may return a two-dimensional array, which spills from the formula's cell
   to the right and down; `#SPILL!` when the cells it needs are taken. Range reads that keep rows and
   columns, array-returning calls accepted where a range is read, `=A1:B3` spilling, display and saving.
2. array constants `{1,2;3,4}`, element-wise array arithmetic (`A2:A9*B2:B9`), `SUMPRODUCT`.
3. arrays returned from a workbook's own (QuickJS) functions.

## Types
- `CellArray = CellValue[][]` (rectangular, at least 1×1) and `FormulaValue = CellValue | CellArray`.
- `FunctionHandler` returns `FormulaValue`; every handler that returns a single value still type-checks.
- `FunctionContext.evaluateFormula` keeps returning a single `CellValue`, so the many handlers that call
  it are unchanged: an array where one value is needed is `#VALUE!`, a 1×1 array its only cell.
  `evaluateValue` returns the array, and `getRangeGrid` reads a reference as rows of cells (or the array
  a call returns).
- A function that may return an array says so: `FunctionDefinition.spills`.

## Which formulas spill
Only a formula that is, at its top level, a call to a function marked `spills`, or a bare range reference
(`=A1:B3`, `=Data!A1:C9`, as in Excel). The rule is static, which is what lets a read of an empty cell
first calculate the spills that could reach it — every pending candidate above and to the left of it,
in reading order, skipping one already being calculated — without calculating ordinary formulas out of
turn (that would report circular references that are not there). A function not marked `spills` that
returns an array answers `#VALUE!`.

## Spilling
- The anchor shows the top-left value; the rest is written into the calculated grid, which grows past
  the sheet's data when it has to.
- A target cell that holds anything in the sheet (a value, a formula, a formula answering "") or that
  another spill already took: the anchor is `#SPILL!` and nothing spills.
- A blank cell inside a spilled `=A1:B3` reads as 0, as `=A1` does.
- Every read sees spilled cells: a single cell, a range, `isCellEmpty`, COUNTA's filled count, and the
  extent `A:A` and `1:1` are bounded to — on this sheet and across sheets.

## Display and saving
- A spilled cell is formatted with its own cell's format (`f`) where the sheet has one, and shows a date
  when its anchor's formula does.
- Only the formula is saved; the spilled values are rebuilt on every calculation. `calculatedRange`
  reads spilled cells like any other.

## Verification
- Unit tests for the pure helpers (array normalization, the spill-candidate rule).
- Engine tests through `SpreadsheetEngine`, with test-only functions registered with `spills`:
  spill shape and placement, `#SPILL!` for each kind of blocker, reads of spilled cells in every form
  and order (before and after the anchor in the walk, from another sheet, `A:A`), aggregates over an
  array-returning call, `=A1:B3`, display formatting, arrays where a value is needed.
- A differential run of the whole existing suite: every formula without an array keeps its answer.
- The app run with a spilling formula: rendered table, mini editor on a spilled cell, `#SPILL!`.
