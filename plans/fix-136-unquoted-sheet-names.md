# fix: unquoted sheet names outside A-Z and digits (#136)

`=基準!B1` read B1 of the current sheet and kept `基準!` in front as text; Excel reads the sheet.
Ranges (`SUM(基準!B1:B3)`) were already read, through `splitSheetReference`.

## Change

One rule for an unquoted sheet name, `UNQUOTED_SHEET_NAME` in `src/engine/sheetReference.ts`:
letters of any script, digits, `_` and `.`, not starting with a digit. Used by

- `matchUnquotedRef` (`evaluator.ts`), which had `[A-Z][A-Z0-9]*`;
- whole-column / whole-row references (`wholeReferences.ts`), which had `[A-Za-z_][\w.]*`;
- `logicalLiterals.ts`, whose word boundary was `\w`, so `TRUEデータ!B1` lost its `TRUE`.

A glued form (`=)Data!B1`, `=1.Data!B1`) keeps today's reading. Giving the scan a left boundary
turned their `#REF!` into leftover text, which is worse; Excel refuses such formulas anyway.

## Behaviour kept

Old and new `findCellRefs`, `boundWholeReferences` and `logicalLiteralsAsBooleans` were run side by side over generated formulas mixing ASCII sheet
references, quoted names, string literals, functions and operators with Japanese, `_` and `.`
words: every formula without those characters gave the same spans. The ones that differ all
contain them.

A name starting with a digit still needs quotes, as in Excel.
