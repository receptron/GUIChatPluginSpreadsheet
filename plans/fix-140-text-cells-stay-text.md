# fix: text that only starts with a number stays text (#140)

`getRawValue` read a text cell with `parseFloat`, so `2023-01` was 2023, `12abc` was 12 — and a
text holding a comma (`Tokyo, Japan`) went down the thousands-separator branch and came back 0.
The cell still SHOWED the text, so nothing looked wrong. `parseNumericString` held a copy of the
same reading, used by aggregates, `COUNT`, criteria and text in arithmetic.

## Change

- `parseNumericString` (`numericCoercion.ts`) reads a number only when the WHOLE text is one as
  typed: plain (`-1.5`, `2e3`), grouped in threes (`1,200`), a percentage (`25%`, `1,000%`) or a
  currency amount (`$1,000`, `-$5`). Anything else is `null`.
- `getRawValue` (`calculator.ts`) uses it instead of its own copy: a number when it is one, the
  text otherwise, 0 for an empty string.

## Behaviour that changes (Excel's in every row)

| | before | after |
|---|---|---|
| `=A1` on `2023-01` / `Tokyo, Japan` | 2023 / 0 | the text |
| `=COUNT("12abc")`, `holdsNumber("12abc")` | 1 / true | 0 / false |
| `toNumber("12abc")` (aggregates) | 12 | 0 |
| `toScalarNumber("12abc")` (ABS, SIGN) | 12 | `#VALUE!` |
| `"1,000%"` | 0.01 | 10 |

Tests that pinned the old reading "as current behaviour, not as correct" now pin Excel's.

## Verified by

- Old and new `parseNumericString` over generated strings: every difference is a number turning
  into text, except `n,nnn%`, which now reads the separators (the old reading divided `1` by 100).
- Every workbook the #3113 stress test produced, calculated on `main` and on this branch: every
  differing cell is a month written `2025-01` — a `SUMIFS` on it (each month had held the whole
  year's total; now each matches the Data sheet) or a `RIGHT` on it.
- `tests/engine/test_textCells.ts`; reverting either half turns most of it red.
