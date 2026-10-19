# fix: unquoted sheet names outside A-Z and digits (#136)

`=基準!B1` read B1 of the current sheet and kept `基準!` in front as text; Excel reads the sheet.
Ranges (`SUM(基準!B1:B3)`) were already read, through `splitSheetReference`.

## Change

`matchUnquotedRef` (`src/engine/evaluator.ts`) accepts a sheet name of letters of any script,
digits, `_` and `.`, not starting with a digit — instead of `[A-Z][A-Z0-9]*`.

## Behaviour kept

Old and new `findCellRefs` were run side by side over generated formulas mixing ASCII sheet
references, quoted names, string literals, functions and operators with Japanese, `_` and `.`
words: every formula without those characters gave the same spans. The ones that differ all
contain them.

A name starting with a digit still needs quotes, as in Excel.
