# fix: date functions read date-like text (#142)

`YEAR`, `MONTH` and the other functions that take a date answered `#VALUE!` for a cell holding
`2025-01`, `Jan 2025` or `2025年1月` — text, since no cell form turned it into a date. And the cell
editor turned a typed date into arithmetic: `2025-01` became `=2025-01` (2024), `2025-01-15`
became `=2025-01-15` (2009).

## Decision: the cell stays text

Making such a cell a date (Excel's reading when you type it) was tried first and measured on the
workbooks the #3113 stress test produced: workbooks that treat a month as text —
`VALUE(RIGHT(A2,2))`, `SUMIF(…,"2023-*",…)` — changed answers silently, including one that is
correct today. Saved workbooks recalculate on open, so they would change too. The user chose to
keep the cell as written and have the date functions read the text, as Excel does with a date
stored as text.

## Change

- `src/engine/dateText.ts` (pure): `dateSerialFromText` — every form a cell already turns into a
  date, plus a month alone (`2025-01`, `2025/1`, `Jan 2025`, `January 2025`, `2025年1月`, as the
  1st) and a Japanese date (`2025年1月15日`). `dateArgument` reads a date function's argument:
  that date for date text, otherwise `toScalarNumber` (`#VALUE!` for other text).
- `functions/date.ts` (`YEAR` … `SECOND`, `DATEDIF`) and `functions/calendar.ts` (`WEEKDAY`,
  `DAYS`, `EDATE`, `EOMONTH`, `WORKDAY`, `NETWORKDAYS`) read their date arguments through it.
- `cellBuilder.ts`: input that is date text is kept as typed, before the formula check. `1/2`
  (no year) is still `=1/2`.

`date-parser.ts`, and so which cells become dates, is unchanged.

## Verified by

- Every workbook from the #3113 stress test, calculated on `main` and on this branch: no cell differs.
- `tests/engine/test_dateText.ts`; without the change most of it is red.
