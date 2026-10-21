# ChangeLog

## @gui-chat-plugin/spreadsheet@5.0.1 / 4.3.1 — 2026-10-22

### Fixed

- **Installs with npm 12 again** (#193, #194): `xlsx` was a runtime dependency on the SheetJS CDN tarball, which npm 12 refuses by default (`allow-remote=none`), so every consumer's install failed (`mulmoclaude@2.8.0`, `mulmoterminal@11.2.0`). SheetJS is already bundled into `dist/vue.js` / `dist/vue.cjs`, so `xlsx` moved to `devDependencies`; the built files are byte-identical to the previous release's. `tests/core/test_packageManifest.ts` fails if a runtime dependency is a URL, git, `file:` or `owner/repo` spec.
- 4.3.1 carries the same change on the `release/4.x` branch (cut from 4.3.0) and is published under the `release-4x` dist-tag, so `^4.3.0` consumers get it while `latest` stays on 5.x.

npm: [`@gui-chat-plugin/spreadsheet@5.0.1`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/5.0.1), [`@gui-chat-plugin/spreadsheet@4.3.1`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/4.3.1)

## @gui-chat-plugin/spreadsheet@5.0.0 — 2026-10-21

The package now needs an ES2023 runtime; the rest is cleanup with no change in behaviour, which clears every code scanning finding.

### Breaking

- **An ES2023 runtime is required** (#185): the engine uses `Array.prototype.toSorted` / `toReversed` (and the typed-array forms) as they are, with no polyfill. That means Node 22 or later (as `engines` already said), Chrome 110, Safari 16, Firefox 115 or later. An older browser stops with `TypeError: … toSorted is not a function` when a sheet is calculated. README's Installation section says so.

### Cleanup (no change in behaviour)

- **oxlint, knip and marker findings** (#185): `toSorted` / `toReversed` in place of `sort` / `reverse` on copies, no shadowed names, helpers that capture nothing moved to module scope, unused exports dropped (and the unused `collectNumericValues` removed), the `TODO` on `FormulaInfo.dependencies` replaced by what the field is. Checked by running `origin/main` and the branch side by side over every formula in the tests and over generated sheets.
- **Repeated code folded** (#186): the RANK-style and `(range, k)` handlers share one factory each, and the name-binding scans share one quote-skipping walk; the tests share their sheet, closeness, fixture, random-stream and script-runner helpers.
- **`View.vue`'s stylesheet replaced by Tailwind classes** (#187): the same values, with the rules for the rendered table as arbitrary variants on its container, so nothing becomes global. Computed styles of every element were compared old against new across the View's states.
- **Large files split** (#188, #189, #190, #191): `evaluator.ts` (expression text, array evaluation, the evaluator context), `calculator.ts` (range reading, sheet preparation, shared types) and `View.vue` (mini editor, table rendering, editor selection, Excel download) — code moved as it was. The package's exports are unchanged (`src/index.ts`, `src/core/index.ts`, `src/engine/index.ts` export the same names). The View was driven old against new in a browser: the same DOM, result data, editor selection and downloaded file. One visible difference: the editor now logs a `console.warn` when a sheet's data has an unknown shape, as the engine already did.

### Tooling

- **`vite.config.ts` uses `import.meta.dirname`** (#192): the package is ESM, and `__dirname` worked only through Vite's bundling config loader; with `--configLoader runner`, vitest and `vite build` now start. The build output is byte-for-byte the same.

📦 **npm**: [`@gui-chat-plugin/spreadsheet@5.0.0`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/5.0.0)

## @gui-chat-plugin/spreadsheet@4.3.0 — 2026-10-21

Dynamic arrays, LET / LAMBDA, the table functions, regression and forecasting, more statistics, and a list of the registered functions for hosts.

### Formulas that answer a table

- **Spill** (#163, part 1 of #148): a formula can answer a table, which spills from its cell right and down as dynamic arrays do in Excel 365. A bare range (`=A1:B3`) or a whole-formula call to a table function spills; a blocked or oversized target is `#SPILL!`, and the first table in reading order keeps its place.
- **Array constants and expressions over arrays** (#172, part 2 of #148): `{1,2;3,4}` constants; `=A2:A9*B2:B9`, `=A2:A9>5` and `=SORT(A2:A9)*2` answer a table, with operands of different sizes lined up as in Excel; `SUMPRODUCT`.
- **Workbook functions may return a table** (#177, closes #148): a QuickJS function returning rows spills like any table, and other functions read it (`=SUM(MYFN(…))`). The answer is written back as tagged JSON and checked with type guards, so a replaced `JSON.stringify` gives `#VALUE!`.
- **Table functions** (#168, #175, #179, #181, closes #150): `SORT`, `SORTBY`, `UNIQUE`, `SEQUENCE`, `TRANSPOSE`, `CHOOSECOLS`, `CHOOSEROWS`, `HSTACK`, `VSTACK`, `TAKE`, `DROP`, `XMATCH`; `FILTER`; `GROUPBY` and `PIVOTBY` (subtotal depths, sort orders, `filter_array`, field headers as Microsoft documents); and `XLOOKUP` answering the whole matching row or column of a two-dimensional return range — which also fixes a silent wrong value, where such a range used to be read flat.
- **LET, LAMBDA, MAP, BYROW, BYCOL, REDUCE** (#174, closes #157).

### Statistics, regression and forecasting

- **Descriptive statistics** (#159, closes #153): `TRIMMEAN`, `AVEDEV`, `DEVSQ`, `SKEW.P`, `PERCENTILE.EXC`, `QUARTILE.EXC`, `PERCENTRANK.EXC`, `RANK.AVG`, `MODE.SNGL`, `PROB`, `COUNTBLANK`, `AVERAGEA`, `MAXA`, `MINA`, and the rank correlations `SPEARMAN` and `KENDALL`.
- **Hypothesis tests** (#161, closes #152): `F.TEST`, `Z.TEST`, `CHISQ.TEST` (and `FTEST`, `ZTEST`, `CHITEST`), plus `ANOVA.TEST`, `MANNWHITNEY.TEST`, `WILCOXON.TEST`, `KS.TEST` and `SHAPIRO.TEST`, which Excel does not have.
- **Matrices and frequency** (#170, closes #154): `FREQUENCY`, `MMULT`, `MINVERSE`, `MDETERM`, `MUNIT`.
- **Regression** (#173, #180): `LINEST` and `LOGEST` (with the stats rows), `TREND` and `GROWTH` over several x variables; polynomial fits through `x^{1,2,3}` and Microsoft's LINEST Example 2 are pinned by tests.
- **Forecasting** (#184, closes #149): `FORECAST.ETS`, `FORECAST.ETS.CONFINT`, `FORECAST.ETS.SEASONALITY`, by additive Holt-Winters with FFT season detection. Excel does not publish its model, so values can differ from Excel's.
- **Time series** (#178, closes #156): `AUTOCORREL`, `EMA`, `DECOMPOSE` (computed as statsmodels / pandas compute them).
- **Random numbers** (#176, closes #155): `RAND`, `RANDBETWEEN`, `RANDARRAY`. Each call is seeded by its sheet, cell and position in the formula, so a workbook calculates to the same numbers every time — the agent and the page see the same table.

### Fixes

- **A formula's `""` and text read the same whichever cell is calculated first** (#164, fixes #162).
- **A criterion compares with its spaces and quotes** (#166, fixes #165): `COUNTIF(A1:A5," x")` no longer matches `x`.
- **Lookups' exact match ignores case** (#169, fixes #167): MATCH, VLOOKUP, HLOOKUP and XLOOKUP, as in Excel.

### For hosts

- **`registeredFunctionsByCategory()` and `isRegisteredFunction(name)` from `./core`** (#183, closes #182): each category's function names, sorted, without the engine's internal functions; and whether a name is one of the engine's own functions, in any case (a workbook's own functions are not). A host that lists the callable functions in its own guidance can check that list against the engine.

📦 **npm**: [`@gui-chat-plugin/spreadsheet@4.3.0`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/4.3.0)

## @gui-chat-plugin/spreadsheet@4.2.5 — 2026-10-20

Date and time format codes, read the way Excel reads them — by `TEXT` and by a cell's display format alike.

- **`TEXT` writes dates with a date format** (#145, fixes #144): `=TEXT(45672,"yyyy-mm")` returned the serial `45672`; it now gives `2025-01`, as do `"YYYY-MM-DD"`, `"mm/dd/yyyy"`, `"dddd, mmmm d"`, `"yyyy年m月d日"`, `"h:mm AM/PM"` and `"hh:mm:ss"`. Letters are case-insensitive; `m` / `mm` is minutes after an hour or before a second and the month otherwise; quoted text and `\x` are literal; `AM/PM` and `A/P` give a 12-hour clock. A text value that reads as a number or a date (`"1,234"`, `2025-01-15`) is formatted as that value. A serial outside 0 to 9999-12-31 is `#VALUE!`. Number formats (`"#,##0.00"`, `"0%"`) are unchanged, and codes Excel reads differently (`[h]:mm`, `[$-409]`, fractional seconds) still go through the number formatter.
- **A cell's date format is read the same way** (#147, fixes #146): `yyyy-mm-dd` displayed as `yyyy-00-dd`, `m/d/yyyy` as itself and `h"時"mm"分"` garbled; they now show `2025-03-04`, `3/4/2025` and `9時05分`. `HH:MM` shows minutes instead of the month. Time-only formats (`ss`, `hh`, `h A/P`) now show a time instead of the number. Formats this reading declines (`[h]:mm`, `Standard`, codes with an unquoted `0` / `#` or other letters) display as before. Saved workbooks change only where the old display disagreed with Excel: lowercase date letters, `M` / `MM` beside an hour or second, `mm` elsewhere, and uppercase `H` with `AM/PM`.
- `h"時"mm"分"` in `TEXT` shows minutes, as Excel's own built-in format does (#147 corrects #145, which read that `m` as the month).

📦 **npm**: [`@gui-chat-plugin/spreadsheet@4.2.5`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/4.2.5)

## @gui-chat-plugin/spreadsheet@4.2.4 — 2026-10-19

Date-like text, left open in 4.2.3 (#142).

- **Date functions read a date written as text** (#143, fixes #142): `YEAR`, `MONTH`, `DAY`, `DATEDIF`, `WEEKDAY`, `DAYS`, `EDATE`, `EOMONTH`, `WORKDAY`, `NETWORKDAYS` and the others now take `2025-01-15`, `2025-01`, `Jan 2025`, `2025年1月` and `2025年1月15日` as that date; a month alone is its first day. The cell itself stays text, so `RIGHT(A1,2)` and `SUMIF(...,"2025-*",...)` work as before, and saved workbooks calculate the same. Arguments that are counts or codes (`WEEKDAY`'s return type, `EDATE`'s months, `WORKDAY`'s days) are still read as numbers. Other text is still `#VALUE!`.
- **Typing a date in the cell editor keeps it** (#143): `2025-01-15` typed into a cell was turned into the formula `=2025-01-15` and showed 2009. A date-like entry now stays as typed. `1/2`, which has no year, is still a fraction.

Still open: `TEXT` does not format a date with a date pattern such as `"YYYY-MM"` (#144).

📦 **npm**: [`@gui-chat-plugin/spreadsheet@4.2.4`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/4.2.4)

## @gui-chat-plugin/spreadsheet@4.2.3 — 2026-10-19

Three fixes found by a stress test of agents building analysis workbooks (receptron/mulmoterminal#3113). The first silently gave wrong numbers with no error showing.

- **Text that only starts with a number stays text** (#141, fixes #140): a text cell such as `2023-01` was read by a formula as 2023, and text holding a comma (`Tokyo, Japan`) as 0, while the cell still showed the text. A `SUMIFS` over a month column written `2025-01` therefore matched every month and put the whole year's total in each. A number is now read only when the whole text is one as typed — plain, grouped in threes (`1,200`), a percentage (`25%`, `1,000%`) or a currency amount (`$1,000`, `-$5`, `$ 5`) — and anything else is text, as in Excel. One reading is shared by cell reads, aggregates, `COUNT`, criteria and text in arithmetic, so `SUM` and `COUNT` agree on the same cell. `YEAR`, `MONTH`, `DAY`, `HOUR`, `MINUTE`, `SECOND` and `DATEDIF` answer `#VALUE!` for text, as the calendar functions already did, rather than reading it as serial 0. `1,000%` is 10 (it was 0.01).
- **`ROW`, `COLUMN`, `ROWS` and `COLUMNS`** (#139, fixes #137): they gave `#NAME?`. `ROW()` / `COLUMN()` answer for the cell the formula is in — also when another formula or another sheet calculates it first — and `ROW(ref)` / `COLUMN(ref)` for a reference's first cell. A whole-column reference is bounded to the sheet's data, so `ROWS(A:A)` counts the data's rows.
- **Unquoted sheet names in any script** (#138, fixes #136): `=基準!B1`, `=Sheet_1!B1` and `=q1.data!B1` read B1 of the current sheet with the name left in front as text. One rule for an unquoted name (letters of any script, digits, `_`, `.`, not starting with a digit) is now shared by cell references, whole-column references and the `TRUE` / `FALSE` word boundary.

Still open: date-like text that is not recognised as a date (`2023-01`, `1/2`, `Jan 2023`) stays text (#142).

📦 **npm**: [`@gui-chat-plugin/spreadsheet@4.2.3`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/4.2.3)

## @gui-chat-plugin/spreadsheet@4.2.2 — 2026-10-19

Two more calculation fixes, where the evaluator read a formula as a JavaScript expression.

- **Parentheses are calculated first** (#135, fixes #94): a comparison inside parentheses was left as text, so `=("a"="b")&"x"` showed the formula itself; it now gives `FALSEx`, as Excel does. Each outermost group is calculated and replaced by its value.
- **Text in arithmetic is a number or `#VALUE!`** (#135, fixes #92): text beside `+ - * / ^` is read as a number when it is one (`"3"`, `"1,000"`, `"50%"`) and gives `#VALUE!` otherwise, so `="a"+1` and `=A1+1` with `A1` holding `abc` no longer give text, `NaN` or `#DIV/0!`. Text beside `&` and comparisons is left as it is.

📦 **npm**: [`@gui-chat-plugin/spreadsheet@4.2.2`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/4.2.2)

## @gui-chat-plugin/spreadsheet@4.2.1 — 2026-10-19

Calculation fixes, found by generated tests and by a stress test of agents building analysis workbooks (receptron/mulmoterminal#3113). Formulas that used to give a wrong number, `0` or text now calculate as Excel does.

- **Sheets that read each other** (#134, fixes #130): a sheet that refers to another sheet that refers back — data → settings → data — calculated the other sheet whole, again from inside each other, so one formula could run thousands of times and workbook functions ran out of time. Each formula cell is now calculated once per calculation, and only the cells a reference needs are read. A cycle across sheets now reads `0` with a `circular` error, as a cycle on one sheet does (it used to read `#ERROR!`).
- **Workbook functions no longer take later calculations down, and `presentSpreadsheet` reports formula errors** (#131, fixes #129): a workbook whose functions ran out of time could abort the shared QuickJS module, so every later read threw. Each set of functions now gets its own module, and freeing one never throws. The tool's reply now names the formula cells that calculate to an error (up to five, then a count), so the agent that wrote them can fix them before handing the workbook over.
- **Range positions across short rows** (#120, fixes #115): a range passing rows shorter than the range shifted the positions, so `SUMIF` paired the wrong cells.
- **Whole-column and whole-row references** (#121, fixes #118): `SUM(A:A)` and `1:1` read nothing and gave `0`.
- **`{v: null}` and `{}` cells after a formula** (#123, fixes #100): they showed as `"null"` or `[object Object]`.
- **Errors inside a range** (#124, fixes #101): aggregates skipped error cells (`=SUM(A1:B1)` gave `2` beside a `#DIV/0!`); the error now propagates.
- **`TRUE` / `FALSE` in a formula** (#125, fixes #109, #91): they were read as text, so `=TRUE+1` did not calculate.
- **Sheet names containing `'`** (#126, fixes #122): `'It''s'!A1` could not be read.
- **Blank cells as arguments and in comparisons** (#127, fixes #99): a blank read as `0` where Excel reads an empty string, so `=A1=""` was `FALSE` and `LEN(A1)` was `1`.
- **`VLOOKUP`, `HLOOKUP` and `INDEX` over `$` or lowercase ranges** (#133, fixes #132): a range written `$A$2:$C$10` or `a2:c10` could not be read, so the lookup gave `#ERROR!`.
- **Values written directly into aggregates** (#128, fixes #116): `=SUM("x",1)` and `=AVERAGE(TRUE,3)` now follow Excel — a logical counts as 1/0, and text that is not a number gives `#VALUE!`.

📦 **npm**: [`@gui-chat-plugin/spreadsheet@4.2.1`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/4.2.1)

## @gui-chat-plugin/spreadsheet@4.2.0 — 2026-10-19

Workbook functions, more analysis functions, and a long list of calculations brought in line with Excel.

### New

- **Workbook functions** (#117, fixes #114): a sheet may carry `functions: [{ name, params, body }]`, and any formula in the workbook calls them, e.g. `=MOVING.AVG(B2:B100, 7)`. Bodies are JavaScript run in QuickJS (WebAssembly), synchronously, with no DOM, network, files or timers; 50 ms per call, 2 s per calculation, 16 MB of memory, one context per function. A range arrives as rows of cells (blank = `null`), a single cell as its value; a time-out is `#NUM!`, a throw or a non-scalar return `#VALUE!`. They are visible only while their own workbook is calculated and cannot redefine a built-in. `presentSpreadsheet` reports definitions it could not use; the View and `readCalculatedRange` load them. QuickJS (`quickjs-emscripten-core`, `@jitl/quickjs-singlefile-mjs-release-sync`) is a new dependency, loaded only for a workbook that defines functions.
- **Tests and distributions** (#108): `T.TEST`, `T.DIST`, `T.DIST.2T`, `T.DIST.RT`, `T.INV`, `T.INV.2T`, `NORM.DIST`, `NORM.S.DIST`, `NORM.INV`, `NORM.S.INV`, `CONFIDENCE.T`, `CONFIDENCE.NORM` (and the older names).
- **Shape of a distribution and means** (#112): `SKEW`, `KURT`, `STANDARDIZE`, `PERCENTRANK.INC`, `GEOMEAN`, `HARMEAN`.
- **Regression, covariance, conditional extremes** (#119): `FORECAST.LINEAR`, `TREND` (single value), `STEYX`, `COVARIANCE.S`, `COVARIANCE.P`, `PEARSON`, `MAXIFS`, `MINIFS`.
- **Date functions and current Excel names** (#78, fixes #73): date functions plus aliases such as `PERCENTILE.INC`, `QUARTILE.INC`, `STDEV.S`, `VAR.P`, `RANK.EQ`.
- **The View follows its file** (#79, fixes #74): an open spreadsheet reloads when the file changes on disk (an agent's edit), holding the change while an edit is unsaved.
- **Save only if unchanged** (#96, fixes #86): `loadSpreadsheet` returns a content `version`; `saveSpreadsheet` takes `baseVersion` and refuses (`conflict: true`) when the file moved on, and the View asks which copy to keep. Saves to one file are serialized. No host change is needed.

### Fixed

- **Blank, text and logical cells counted as 0** (#104, fixes #103): criteria (`COUNTIF(…,"<2")`, `=0`, `""`, bare `=` / `<>`, text patterns against numbers), `AVERAGEIF`'s average range, paired functions (`CORREL`/`SLOPE`/`INTERCEPT`/`RSQ`), `COUNTA` (a formula's `""` now counts), and `TRUE`/`FALSE` in numeric ranges now follow Excel. Criteria read `5%` and `1,200` as numbers; a logical criteria matches logical cells only.
- **Rounding at 15 significant digits** (#107, fixes #105): `ROUND(1.005,2)` is 1.01, `ROUNDDOWN(523.685,3)` is 523.685, `FLOOR(0.3,0.1)` is 0.3; exact integers and huge values are left alone. `POWER` gives `#DIV/0!` for 0 to a negative power and `#NUM!` for `0^0` and overflow.
- **Dates shown only when they come from a date** (#110, fixes #106): an unformatted formula result between 36000 and 63499 is no longer displayed as a date unless the formula uses a date function or a date cell — a sales total of 52,345 stays a number.
- **Operators and comparisons**: `&` with Excel's precedence and type rules (#77, fixes #75); comparisons the Excel way, text, logicals and `&` included (#90, fixes #81); a parenthesised literal on one side of a comparison (#97); `IFS` conditions (#111, fixes #93); `^` precedence, `-2^2` (#87, fixes #82); repeated signs `=--2`, `=1--2` (#113, fixes #88); an empty cell joined with `&` adds nothing (#102, fixes #83).
- **Criteria**: a criteria is evaluated as an expression, so a cell reference or `">"&A1` works (#76, fixes #72); a date criteria with an operator compares as a date (#89, fixes #84).
- **Tests and docs**: PV analysis expectations computed from the unrounded monthly rate (#80, fixes #57); date serials follow the real calendar, documented and pinned (#95, fixes #85); ChangeLog for 4.1.0 (#71).

📦 **npm**: [`@gui-chat-plugin/spreadsheet@4.2.0`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/4.2.0)

## @gui-chat-plugin/spreadsheet@4.1.0 — 2026-10-19

Analysis functions, and a way for another plugin to read a calculated range.

- **14 new statistical functions** (#68, fixes #67): `CORREL`, `SLOPE`, `INTERCEPT`, `RSQ`, `PERCENTILE`, `QUARTILE`, `LARGE`, `SMALL`, `RANK`, `STDEVP`, `VARP`, `SUMIFS`, `COUNTIFS`, `AVERAGEIFS`. They used to evaluate to `#NAME?`, so hosts had to compute these in a script and paste the result in as a value that never recalculated.
  - `PERCENTILE` / `QUARTILE` interpolate like Excel's `PERCENTILE.INC` / `QUARTILE.INC`.
  - The paired functions (`CORREL` and the regression ones) pair two ranges by position and skip a pair with a blank or text on either side. Ranges of different sizes give `#N/A`.
  - `*IFS` read every range raw so the rows stay aligned. Ranges of different sizes give `#VALUE!`. `AVERAGEIFS` leaves out matched cells that hold no number.
  - Checked against the worked examples in Microsoft's documentation, and against simple-statistics on generated data.
- **`calculatedRange` / `readCalculatedRange` from `./core`** (#70, fixes #69): return a range of a saved workbook (`Data!A1:C13`) as calculated rows, so another plugin — a chart — can draw from the sheet instead of a copy of its numbers. The engine now ships in the `./core` entry.
  - A number formatted as text (`1,200`, `25.0%`) comes back as a number.
  - A date comes back as its displayed text.
  - Blanks and cells beyond the data come back as `null`, and error cells as their code.
  - Ranges are capped at `MAX_RANGE_CELLS`, and `readCalculatedRange` accepts only paths under `artifacts/spreadsheets/`.
- **Docs** (#66): `docs/ChangeLog.md` records 4.0.2.

📦 **npm**: [`@gui-chat-plugin/spreadsheet@4.1.0`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/4.1.0)

## @gui-chat-plugin/spreadsheet@4.0.2 — 2026-10-18

Node.js 22 is supported again. 4.0.0 raised `engines` to `node >=24`, which made Yarn v1 refuse to install the package on Node 22; only the development tooling needed Node 24.

- **`engines: node >=22`** (#65, #64): the published package needs nothing newer than Node 22. CI stays on Node 24 / 26, because installing the dev tooling (scoria) requires Node 24; the package's build and test suite were also run once on Node 22 (in #64) and passed, but there is no standing Node 22 job.
- **Docs** (#62): `docs/ChangeLog.md` records 4.0.1.

📦 **npm**: [`@gui-chat-plugin/spreadsheet@4.0.2`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/4.0.2)

## @gui-chat-plugin/spreadsheet@4.0.1 — 2026-10-18

Bug-fix release. `LOG10` now calculates, function-looking text inside a string literal is no longer evaluated, and the README lists exactly the functions the engine provides.

- **`LOG10` calculates** (#60): the engine registered `LOG10`, but the evaluator and `looksLikeFormula` only recognised function names made of letters, so it evaluated to `#ERROR!`. A name containing digits is now treated as a call when it is registered (`isCallableName`); since `LOG10` has the same shape as a cell reference, an unregistered one such as `A1(2)` keeps its previous result.
- **Calls inside string literals are text** (#60): the scan for calls skips string literals, so `="x"&"SUM(1,2)"` gives `xSUM(1,2)` (it gave `x(3)` before).
- **README function list** (#60, fixes #59): the "Supported Functions" section listed functions the engine does not have (they evaluated to `#NAME?`) and omitted ones it does. It now matches the registry category by category, and `tests/engine/test_documentedFunctions.ts` fails if the README, the model guidance (`SYSTEM_PROMPT` / `TOOL_DEFINITION`) or the bundled samples drift from the registry.
- **Code-scanning findings** (#55, #58): `cause` attached to the rethrown sheets parse error (`lib` raised to ES2022; `target` unchanged); duplicated argument reading in the financial handlers, FIND / SEARCH and the quote-aware condition scanner extracted (behaviour verified unchanged against the previous code, with permanent tests for argument order, first error and quoting); `knip.json` lists the test entry points; four previously unrun engine scripts now run in CI and check their results; a script testing a removed API deleted.
- **CI** (#53, #61): scoria runs through the shared reusable workflow and the README shows its badge; scoria `^0.4.1`.
- **Docs** (#52): `docs/ChangeLog.md` records 4.0.0.

📦 **npm**: [`@gui-chat-plugin/spreadsheet@4.0.1`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/4.0.1)

## @gui-chat-plugin/spreadsheet@4.0.0 — 2026-10-18

**Breaking release: Node.js 24 or later is now required** (`engines: { "node": ">=24" }`). There are no API or behaviour changes from 3.0.0; the library code differs only by formatting.

- **Node.js >= 24** (#49): the package now declares `engines.node >=24`, and CI runs on Node 24.x and 26.x (Linux / macOS / Windows) instead of 22.x and 24.x. Yarn v1 refuses to install on Node 22. This follows from the scoria devDependency, which requires Node 24.
- **Code-quality measurement with scoria** (#43, #49, #50, #51): `scoria.config.json` freezes the detected profile (library, vue + ts), `.scoria/baseline.json` records the reference run, and a `scoria` workflow reports scores on every PR and push to `main` (report-only, never fails a build) and uploads SARIF to code scanning. scoria is a devDependency (`^0.4.0`) run through `yarn quality`; 0.4.0 type-checks Vue with `vue-tsc`, which removes three false `TS2307` findings on `.vue` imports.
- **Coverage** (#47): `yarn test:coverage` collects coverage across all test suites with `c8` (`yarn test:suites` — vitest and the `tsx`/`node:test` suites), including files no test loads, and scoria reads `coverage/lcov.info`.
- **Prettier** (#46): `.prettierrc` (`printWidth: 160`), `yarn format` / `yarn format:check`, the codebase reformatted once, and `format:check` in CI on Linux. Reformatted JSON fixtures parse identically.
- **Dependencies** (#41, #38, #39): typescript-eslint `^8.71.2`, `@vitejs/plugin-vue` `^6.0.10`, eslint `^10.13.0`, globals `^17.13.0`, vite `^8.3.4`, vitest `^5.0.5`, vue `^3.5.44`, vue-tsc `^3.3.13`; lockfile bumps of source-map-js 1.2.2 and postcss-selector-parser 7.1.6 (GHSA-rj75-hqrm-r3gf).
- **Docs** (#40): `docs/ChangeLog.md` added with the 3.0.0 entry.

### Breaking changes
- Requires Node.js >= 24.

📦 **npm**: [`@gui-chat-plugin/spreadsheet@4.0.0`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/4.0.0)

## @gui-chat-plugin/spreadsheet@3.0.0 — 2026-10-18

**Breaking release.** The View is now the same one MulmoClaude ships, and it runs in any gui-chat-protocol host: saving and translations go through the protocol's generic runtime instead of host-specific APIs. See [Upgrading from 2.x](https://github.com/receptron/GUIChatPluginSpreadsheet#upgrading-from-2x).

- **Workbooks are saved, and cell edits are written back** (#37): with the host's `files.artifacts`, `presentSpreadsheet` writes the workbook to `artifacts/spreadsheets/YYYY/MM/<id>.json` (the layout MulmoClaude already uses, so existing files still open) and `data.sheets` holds that path. The tool message names the file, so the model can read the user's edits back. Hosts without `files.artifacts` still get the workbook inline.
- **Load / save dispatch** (#37): the View sends `useRuntime().dispatch({ kind: "loadSpreadsheet" | "saveSpreadsheet", path, … })`. `pluginCore.execute` routes these itself (MulmoTerminal needs no extra wiring); hosts with their own route can call `executeSpreadsheetDispatch` after `isSpreadsheetDispatchArgs`. Paths outside `artifacts/spreadsheets/*.json` are rejected.
- **Ordering** (#37): a load overtaken by a newer one is dropped, and saves are serialised (`createSerialLock`), so the last edit made is the last one written.
- **UI in 8 languages** (#37): en, ja, de, es, fr, ko, pt-BR, zh, via `createUseT`, following the host locale; date day/month order follows it too.
- **View parity with MulmoClaude** (#37): uses the engine's own cell builder and reference extraction, validates stored workbooks, escapes rendered error text, and opens cross-origin links in cells in a new tab.
- **Packaging** (#37): `gui-chat-protocol` is no longer bundled (the runtime is found by injection Symbol, so the host's copy must be used); peer range is `^2.3.0`.
- **Dependencies** (#35): `gui-chat-protocol` `^2.1.0`, `vitest` `^5.0.2`, lockfile deduplicated.

### Breaking changes
- `SpreadsheetToolData.sheets` is `SpreadsheetSheet[] | string` — a path when the host provides `files.artifacts`.
- `pluginCore.execute` also accepts `SpreadsheetDispatchArgs`.
- Peer `gui-chat-protocol` `^2.3.0`, provided by the host.
- `SpreadsheetCell.v` may be a boolean; `SpreadsheetSheet.data` is `StorableCell[][]`.

📦 **npm**: [`@gui-chat-plugin/spreadsheet@3.0.0`](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet/v/3.0.0)
