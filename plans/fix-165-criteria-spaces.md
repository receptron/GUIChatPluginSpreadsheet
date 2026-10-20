# fix: a criteria compares with its spaces and quotes (#165)

## Defect
`parseCriteria` trimmed the criteria and stripped a leading and a trailing quote before comparing, so
`COUNTIF(A1:A5," x")` matched `x`. That handling dates from when it received the criteria's source text;
every caller now passes the value the argument evaluated to (`criteriaArg`, wildcard lookups), where the
spaces and quotes belong to the value.

## Rule
- The criteria is compared as written: `" x"` matches only ` x`, `"q"` with its quotes matches only `"q"`.
- The number after an operator may stand apart from it: `">= 5"` is `>=5`.
- A bare `=` matches a cell holding nothing, not one holding a space; `<>` the rest.

## Verification
- `tests/engine/test_criteriaSpaces.ts` through the engine; `test_registry.ts`'s criteria tests rewritten
  for this contract (they pinned the source-text stripping).
- A differential run over the test corpus's formulas against main, with ` x` and `"q"` cells in the data:
  no difference.
