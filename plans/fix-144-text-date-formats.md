# fix: TEXT renders date and time format codes (#144)

## Problem

`TEXT(45672,"yyyy-mm")` returned `45672`. TEXT only rendered number patterns
(`textFormat.ts`), and anything else fell back to the value's own text. An agent
that knows Excel takes a month out of a date column with `TEXT(A2,"YYYY-MM")`,
so a `SUMIF` criterion or a heading silently became a serial.

A date read from a CSV is a text cell (#142 kept it text), so `TEXT(A2,"yyyy-mm")`
on `2025-01-15` in A2 also has to read the text as a date.

## Approach

- New pure module `src/engine/textDateFormat.ts`:
  - `parseDatePattern(pattern)` splits an Excel date code into tokens, reading the
    letters case-insensitively as Excel does. `m` / `mm` is minutes right after an
    hour or right before a second, months otherwise. `"quoted"` and `\x` are
    literals. Returns `null` when the code has no date token, or uses a feature
    not rendered (`[h]` elapsed time, `[$-409]` locale).
  - `renderDatePattern(serial, tokens)`.
- TEXT: a date code renders the date; a negative serial is `#VALUE!`, as in Excel.
  Number codes keep `formatWithPattern`.
- TEXT reads a text value that is a number or a date (`"1,234"`, `"2025-01-15"`)
  as that number, as Excel does. Other text still passes through unchanged.

## Not changed

The cell display formats (`formatter.ts` `formatDate`) keep their own case-sensitive
tokens. Changing them would move how stored workbooks display, which is a
separate decision.

## Tests

`tests/engine/test_textDateFormat.ts`: the issue's cases, each token width,
minutes vs months, 12-hour clock, literals, unsupported codes, text values, and a
generated check that `TEXT(serial,"yyyy-mm-dd")` reads back as the same date.
