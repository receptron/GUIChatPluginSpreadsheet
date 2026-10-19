# fix: a cell's date format reads lowercase codes as Excel does (#146)

## Problem

A cell's display format read only its own case-sensitive tokens: `yyyy-mm-dd`
showed `yyyy-00-dd`, `m/d/yyyy` showed itself, and `HH:MM` put the month where
the minutes go. Agents write Excel's lowercase codes, and a chart drawn from such
a cell carries the same broken text on its axis.

## Approach

- `formatter.formatNumber` sends a date code through `textDateFormat`
  (`parseDatePattern` / `renderDatePattern`), the Excel reader TEXT already uses
  (#144), so a cell and TEXT read a code the same way.
- A code that reader declines keeps the old case-sensitive reading, so it
  displays as before: `[h]:mm`, a code carrying an unquoted `0` or `#`, and one
  carrying an unquoted Latin letter that is no date part (`Standard`,
  `invalid format`, the era codes `e` `g` `b`).
- The minutes rule goes back to skipping any text between the parts: Excel's own
  Japanese time format `h"時"mm"分"` shows minutes. #145 had narrowed it to
  separators after a review comment; that made `h"時"mm"分"` show the month.

## What moves in stored workbooks

Only codes the old reader got wrong by Excel's rules: lowercase years, days and
months; `M`/`MM` beside an hour or second (now minutes); `mm` away from them (now
the month); an uppercase `H` with AM/PM (now the 12-hour clock).

## Verification

- A generated differential (old `formatNumber` beside the new one over codes
  built from the old reader's own tokens) finds no difference those rules do not
  explain.
- The stress-test workbooks (receptron/mulmoterminal#3113) display the same.
