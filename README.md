# @gui-chat-plugin/spreadsheet

[![npm version](https://badge.fury.io/js/%40gui-chat-plugin%2Fspreadsheet.svg)](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet)
[![scoria](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/receptron/GUIChatPluginSpreadsheet/badges/scoria.json)](https://github.com/receptron/GUIChatPluginSpreadsheet/actions/workflows/scoria.yml)

A spreadsheet plugin for [MulmoChat](https://github.com/receptron/MulmoChat) - a multi-modal voice chat application with OpenAI's GPT-4 Realtime API.

## What this plugin does

This plugin provides a full-featured spreadsheet component with:

- Excel-like cell editing with formula support
- Mathematical functions (SUM, AVERAGE, MIN, MAX, etc.)
- Text functions (CONCATENATE, LEFT, RIGHT, MID, etc.)
- Date functions (TODAY, NOW, DATE, YEAR, MONTH, DAY, etc.)
- Logical functions (IF, AND, OR, NOT, etc.)
- Lookup functions (VLOOKUP, HLOOKUP, INDEX, MATCH)
- Financial functions (PMT, PV, FV, NPV, IRR)
- Multi-sheet support
- Excel file export (.xlsx)
- Saving to the host's artifacts area, with cell edits written back
- UI in 8 languages, following the host's locale
- Cell formatting and styling

## Important: SheetJS Dependency

> **Note:** This package uses [SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) for Excel file export.
> SheetJS is **not installed from npm**, but directly from the official SheetJS CDN:
> ```
> https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
> ```
> See [SheetJS Installation Guide](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) for details.

## Installation

```bash
yarn add @gui-chat-plugin/spreadsheet gui-chat-protocol
```

> `gui-chat-protocol` is a peer dependency — install it alongside the plugin; the host application provides the runtime and this plugin only declares the compatible range.


## Usage

### Vue Implementation (for MulmoChat)

```typescript
// In src/tools/index.ts
import SpreadsheetPlugin from "@gui-chat-plugin/spreadsheet/vue";

const pluginList = [
  // ... other plugins
  SpreadsheetPlugin,
];

// In src/main.ts
import "@gui-chat-plugin/spreadsheet/style.css";
```

### Core Only (Framework-agnostic)

```typescript
import { pluginCore, TOOL_NAME } from "@gui-chat-plugin/spreadsheet";
```

## Saving workbooks (host integration)

The plugin works in two modes, chosen by what the host passes to `execute`:

- **With `files.artifacts`** (the gui-chat-protocol runtime capability): the workbook is written to `artifacts/spreadsheets/YYYY/MM/<id>.json` and `data.sheets` holds that path. The View reads and saves it through `useRuntime().dispatch`, so cell edits land in the same file and the model can read them back from it.
- **Without it**: `data.sheets` holds the workbook itself, and edits are reported through `updateResult` only.

The View sends two dispatch calls:

| `kind` | other args | result |
|--------|-----------|--------|
| `loadSpreadsheet` | `path` | `{ data: { sheets, version } }` |
| `saveSpreadsheet` | `path`, `sheets`, `baseVersion?` | `{ data: { sheets: path, version } }`, or `{ data: { sheets, version, conflict: true } }` |

`path` must be a `.json` file under `artifacts/spreadsheets/`.

`version` is the SHA-256 of the file's text. The View saves with the `baseVersion` of the sheets it shows, and the save is written only while the file still has that version. When an agent or another View wrote the file in between, nothing is written: the answer carries the file's current `sheets` and `version` with `conflict: true`, and the View asks the user to keep that version or save their edit over it. A save without `baseVersion` is written unconditionally, as before. Saves of one file through the plugin are serialized, so two Views cannot both pass the check; a write that bypasses the plugin can still land between a save's check and its write, because `files.artifacts` has no compare-and-write.

A host that routes the View's `dispatch` to the plugin's own `execute` (as MulmoTerminal does) needs nothing more: `pluginCore.execute` tells the two calls apart by `kind`. A host with its own dispatch route can call `executeSpreadsheetDispatch(files.artifacts, args)` after checking `isSpreadsheetDispatchArgs(args)`.

The View must be rendered inside the host's `PLUGIN_RUNTIME_KEY` provider to load or save a saved workbook; it also takes the UI language from that runtime (`en`, `ja`, `de`, `es`, `fr`, `ko`, `pt-BR`, `zh`, falling back to English).

## Upgrading from 2.x

3.0.0 changes what a host receives, so it is a major release:

- `SpreadsheetToolData.sheets` is `SpreadsheetSheet[] | string`. With `files.artifacts` the tool returns the saved file's path instead of the workbook, so code that reads `data.sheets` as an array has to handle the path (or load it with the `loadSpreadsheet` dispatch).
- `pluginCore.execute` also accepts `SpreadsheetDispatchArgs`.
- The `gui-chat-protocol` peer is `^2.3.0`, and the package no longer bundles it: the host's copy is used.
- Cells may hold a boolean `v`, and stored workbooks may contain bare values, `null` gaps and `{}` cells (`StorableCell`).

## Package Exports

| Export | Description |
|--------|-------------|
| `@gui-chat-plugin/spreadsheet` | Core (framework-agnostic) |
| `@gui-chat-plugin/spreadsheet/vue` | Vue implementation with UI components |
| `@gui-chat-plugin/spreadsheet/style.css` | Tailwind CSS styles |

## Supported Functions

### Mathematical
`ABS`, `CEILING`, `EXP`, `FLOOR`, `INT`, `LN`, `LOG`, `LOG10`, `MDETERM`, `MINVERSE`, `MMULT`, `MOD`, `MUNIT`, `PI`, `POWER`, `ROUND`, `ROUNDDOWN`, `ROUNDUP`, `SEQUENCE`, `SIGN`, `SQRT`, `SUMPRODUCT`, `TRUNC`

### Text
`CONCAT`, `CONCATENATE`, `EXACT`, `FIND`, `LEFT`, `LEN`, `LOWER`, `MID`, `PROPER`, `REPLACE`, `RIGHT`, `SEARCH`, `SUBSTITUTE`, `TEXT`, `TRIM`, `UPPER`, `VALUE`

### Date & Time
`DATE`, `DATEDIF`, `DAY`, `DAYS`, `EDATE`, `EOMONTH`, `HOUR`, `MINUTE`, `MONTH`, `NETWORKDAYS`, `NOW`, `SECOND`, `TIME`, `TODAY`, `WEEKDAY`, `WORKDAY`, `YEAR`

A formula without a format code shows its number as a date only when the number is a date by origin: the formula starts with DATE, TODAY, EDATE, EOMONTH or WORKDAY, or its first reference is a date (a cell with a date format, typed as a date, or itself such a formula, on any sheet). A total that lands on 52,345 stays a number. Give a formula a format code to choose its display yourself.

A date format code is read as Excel reads it, for a cell's display and for TEXT alike: letters in any case (yyyy-mm-dd or YYYY-MM-DD), and m or mm as minutes when the part before it is an hour or the part after it a second (h:mm, h"時"mm"分"), the month otherwise.

Dates are serial numbers on the real calendar, as in LibreOffice and Google Sheets. Excel counts a 1900-02-29 that never existed, so a serial before 61 (1900-03-01) is one day earlier here than in Excel; from 61 on they are the same.

### Logical
`AND`, `BYCOL`, `BYROW`, `FALSE`, `IF`, `IFERROR`, `IFNA`, `IFS`, `LAMBDA`, `LET`, `MAP`, `NOT`, `OR`, `REDUCE`, `TRUE`

### Lookup & Reference
`CHOOSECOLS`, `CHOOSEROWS`, `COLUMN`, `COLUMNS`, `DROP`, `GROUPBY`, `HLOOKUP`, `HSTACK`, `INDEX`, `MATCH`, `PIVOTBY`, `ROW`, `ROWS`, `SORT`, `SORTBY`, `TAKE`, `TRANSPOSE`, `UNIQUE`, `VLOOKUP`, `VSTACK`, `XLOOKUP`, `XMATCH`

A range is written `A1:C10`, `Data!A1:C10` or `'My Sheet'!A1:C10`. A whole column (`A:A`, `B:D`) or a whole row (`1:1`) covers its sheet as far as the data reaches, which gives the same answers, since everything past the data is blank. `ROW()` and `COLUMN()` give the number of the cell the formula is in; given a range, they answer for its first cell.

### Statistical
`ANOVA.TEST`, `AVEDEV`, `AVERAGE`, `AVERAGEA`, `AVERAGEIF`, `AVERAGEIFS`, `BETA.DIST`, `BETA.INV`, `BETAINV`, `BINOM.DIST`, `BINOM.INV`, `BINOMDIST`, `CHIDIST`, `CHIINV`, `CHISQ.DIST`, `CHISQ.DIST.RT`, `CHISQ.INV`, `CHISQ.INV.RT`, `CHISQ.TEST`, `CHITEST`, `CONFIDENCE.NORM`, `CONFIDENCE.T`, `CORREL`, `COUNT`, `COUNTA`, `COUNTBLANK`, `COUNTIF`, `COUNTIFS`, `COVARIANCE.P`, `COVARIANCE.S`, `CRITBINOM`, `DEVSQ`, `EXPON.DIST`, `EXPONDIST`, `F.DIST`, `F.DIST.RT`, `F.INV`, `F.INV.RT`, `F.TEST`, `FDIST`, `FINV`, `FISHER`, `FISHERINV`, `FORECAST`, `FORECAST.LINEAR`, `FREQUENCY`, `FTEST`, `GAMMA.DIST`, `GAMMA.INV`, `GAMMADIST`, `GAMMAINV`, `GAMMALN`, `GAMMALN.PRECISE`, `GAUSS`, `GEOMEAN`, `HARMEAN`, `HYPGEOM.DIST`, `INTERCEPT`, `KENDALL`, `KS.TEST`, `KURT`, `LARGE`, `LOGINV`, `LOGNORM.DIST`, `LOGNORM.INV`, `MANNWHITNEY.TEST`, `MAX`, `MAXA`, `MAXIFS`, `MEDIAN`, `MIN`, `MINA`, `MINIFS`, `MODE`, `MODE.SNGL`, `NEGBINOM.DIST`, `NORM.DIST`, `NORM.INV`, `NORM.S.DIST`, `NORM.S.INV`, `PEARSON`, `PERCENTILE`, `PERCENTILE.EXC`, `PERCENTILE.INC`, `PERCENTRANK`, `PERCENTRANK.EXC`, `PERCENTRANK.INC`, `PHI`, `POISSON`, `POISSON.DIST`, `PROB`, `QUARTILE`, `QUARTILE.EXC`, `QUARTILE.INC`, `RANK`, `RANK.AVG`, `RANK.EQ`, `RSQ`, `SHAPIRO.TEST`, `SKEW`, `SKEW.P`, `SLOPE`, `SMALL`, `SPEARMAN`, `STANDARDIZE`, `STDEV`, `STDEV.P`, `STDEV.S`, `STDEVP`, `STEYX`, `SUM`, `SUMIF`, `SUMIFS`, `T.DIST`, `T.DIST.2T`, `T.DIST.RT`, `T.INV`, `T.INV.2T`, `T.TEST`, `TREND`, `TRIMMEAN`, `TTEST`, `VAR`, `VAR.P`, `VAR.S`, `VARP`, `WEIBULL`, `WEIBULL.DIST`, `WILCOXON.TEST`, `Z.TEST`, `ZTEST`

`ANOVA.TEST(range1, range2, …)`, `MANNWHITNEY.TEST(range1, range2)`, `WILCOXON.TEST(range)` or `WILCOXON.TEST(range1, range2)` (paired), `KS.TEST(range1, range2)` and `SHAPIRO.TEST(range)` are not Excel functions: each returns a two-sided p value, choosing an exact or a normal null distribution as scipy.stats does by default.

### Financial
`FV`, `IPMT`, `IRR`, `NPER`, `NPV`, `PMT`, `PPMT`, `PV`, `RATE`

## Formulas that answer a table

A formula that is a range and nothing else, such as `=A1:C5` or `=Data!A1:B10`, answers the whole range. Its values spill from the formula's cell to the right and down, as dynamic arrays do in Excel 365. Each cell reads as `=A1` would read it, so a blank cell spills as 0.

- **Blocked spills.** If a cell the result needs already holds something (a value, a formula, or part of another spilled result), the formula shows `#SPILL!` and nothing spills.
- **Reading spilled cells.** Other formulas read spilled cells like any others: `=B3`, `=SUM(B:B)` and `=COUNTA(B1:B9)` all see them.
- **Formatting.** A spilled cell takes its own cell's number format if it has one, and the formula cell's format otherwise.
- **Saving.** Only the formula is saved. The spilled values are rebuilt on every calculation.

A function can answer a table too: `GROUPBY`, `PIVOTBY`, `SORT`, `SORTBY`, `UNIQUE`, `SEQUENCE`, `TRANSPOSE`, `CHOOSECOLS`, `CHOOSEROWS`, `HSTACK`, `VSTACK`, `TAKE`, `DROP`, `MMULT`, `MINVERSE`, `MUNIT` and `FREQUENCY` do, and they take each other's tables (`=SORT(UNIQUE(A2:A100))`). An answer with no cells is `#CALC!`. A range argument accepts such a call, as in `=SUM(…)` over it.

### Grouping

`GROUPBY(row_fields, values, function, [field_headers], [total_depth], [sort_order], [filter_array])` answers a row per group of row_fields (text keys compared without regard to case), each value column aggregated by function: a function's name such as `SUM`, `AVERAGE` or `COUNT`, or a `LAMBDA` of one parameter, given the group's values as a column. `PIVOTBY(row_fields, col_fields, values, function, [field_headers], [row_total_depth], [row_sort_order], [col_total_depth], [col_sort_order], [filter_array])` lays the col_fields keys across the top and the row_fields keys down the side; a cell no row has both keys for is blank.

- field_headers: 0 none, 1 there and hidden, 2 not there and made up (`Row Field 1`, `Value 1`), 3 there and shown; left out, there when the first value is text and the second a number, and then shown. PIVOTBY reads headers the same way but shows none, in any mode.
- Totals: a `Total` row (and for PIVOTBY a `Total` column) by default; 0 for none, negative to put it first. GROUPBY's total_depth n also gives subtotals for the first 1 … n − 1 key columns (as many as there are), each after its rows; it defaults to the number of key columns. PIVOTBY's depths are 0, 1 or -1; subtotals there are `#VALUE!`.
- sort_order: columns of the answer, 1-based, negative for descending, one or an array; left out, each key column ascending. PIVOTBY's row_sort_order and col_sort_order number the key columns and then the values, which sorts by each row's or column's total.
- filter_array: TRUE (or a number other than 0) for each data row to keep.
- Not supported: GROUPBY's field_relationship, PIVOTBY's relative_to, more than one PIVOTBY values column and PIVOTBY subtotals; each is `#VALUE!`.

### Arrays in expressions

An array constant is written in braces: `{1,2,3}` is a row, `{1;2;3}` a column and `{1,2;3,4}` two rows of two. Its elements are numbers, text in double quotes, `TRUE`, `FALSE` or an error such as `#N/A`; anything else (a reference, a call) is `#ERROR!`.

An expression with a range, an array constant or a table-answering call among its operands is calculated element by element and answers a table: `=A2:A9*B2:B9`, `=A2:A9>5`, `=A2:A9&"!"`, `=SORT(A2:A9)*2`. Each element reads its cell as a reference to that one cell would, so a blank cell is 0 beside `*` and empty text beside `&`. Operands of different sizes line up as in Excel: a single row or column is repeated, and past the end of a shorter operand the element is `#N/A` (`={1,2,3}+{1,2}` is `{2,4,#N/A}`). An element that fails, such as a division by zero, is that error, and the other elements still answer. A range read inside a call belongs to the call: `=SUM(A2:A9)*2` is one number. A range argument reads such an expression's cells: `=SUM(A2:A9*B2:B9)`, `=SUMPRODUCT((A2:A9>5)*B2:B9)`.

A function that takes one value does not yet calculate over an array (`=ABS(A2:A9)`, `=IF(A2:A9>5,1,0)`); given a table of more than one cell, it answers `#VALUE!`.

## Names and LAMBDA

`LET` gives names to values for one formula: `=LET(total, SUM(A2:A9), total / COUNT(A2:A9))`. A value may use the names before it, and a name bound to a range stays that range, so `=LET(x, A2:A9, SUM(x * 2))` reads its cells as a reference does. A name is letters, digits, `_` and `.`, starting with a letter or `_`; one that looks like a cell (`A1`), a logical value, or R or C is `#NAME?`.

`LAMBDA(param1, …, calculation)` is a calculation over named parameters. It is called where it is written (`=LAMBDA(x, x * 2)(3)` is 6), through a name (`=LET(f, LAMBDA(x, x * 2), f(3))`), or by:

- `MAP(array1, [array2, …], lambda)`: the LAMBDA at each element, the arrays lined up as in `A1:A3+B1:B3`, answering a table;
- `BYROW(array, lambda)` and `BYCOL(array, lambda)`: the LAMBDA at each row (a column of answers) or each column (a row of answers); a row given from a range is that row's range, so `=BYROW(A2:C9, LAMBDA(row, MAX(row)))` works as `MAX(A2:C2)` does;
- `REDUCE([initial], array, lambda(accumulator, value))`: the LAMBDA over every element in reading order, carrying its answer forward. An initial value left out is 0.

A LAMBDA given the wrong number of arguments is `#VALUE!`, and one written but never called is `#CALC!`. Where one value is wanted (each element of `MAP`, each line of `BYROW` and `BYCOL`), an answer that is a table is `#CALC!`.

## Workbook functions

A workbook can define functions of its own, for an analysis no built-in function does. Each sheet may carry an optional `functions` list; a function defined on any sheet is callable from every sheet of that workbook:

```json
{
  "name": "Data",
  "functions": [
    {
      "name": "MOVING.AVG",
      "params": ["values", "n"],
      "body": "const xs = values.flat().filter((v) => typeof v === 'number'); const tail = xs.slice(-n); return tail.reduce((a, b) => a + b, 0) / tail.length;"
    }
  ],
  "data": [[{ "v": 100 }, { "v": "=MOVING.AVG(A1:A30, 7)" }]]
}
```

- A function body is JavaScript, run in [QuickJS](https://github.com/justjake/quickjs-emscripten) (WebAssembly) with no DOM, network, file system or timers, at most 50 ms per call, 2 s per calculation and 16 MB of memory. Each function has a global scope of its own.
- A range argument arrives as rows of cells (an array of arrays, a blank cell as `null`); a single cell and any other argument as its value. A whole column or row (`A:A`, `2:2`) arrives as the range it covers in its sheet's data. An argument that is an error is passed on without calling the function.
- Return a number, text or `true`/`false`, or a table: an array of rows (`[[1, 2], [3, 4]]`), which spills like any table. A flat array is one column, and short rows are filled with `#N/A`. A time-out or a non-finite number shows `#NUM!`; a thrown error, an empty array or any other return value shows `#VALUE!`. In a table, `null` is a blank cell and any other value that is not a number, text or a logical is a `#VALUE!` cell.
- A name is letters and digits, parts joined by dots, and cannot be a built-in function's. `presentSpreadsheet` says in its reply which definitions could not be used.
- `presentSpreadsheet`'s reply also lists formula cells that calculate to an error (a few, and how many in all), so an agent can fix a workbook before handing it over: the saved file holds formulas, not results.
- Each workbook's functions get a QuickJS instance of their own, so a failure in one (an abort while freeing a runtime that ran out of time) cannot affect another.
- QuickJS loads only for a workbook that defines functions. The View and `readCalculatedRange` load it themselves; a host calling `calculatedRange` directly passes the set from `loadCustomFunctions`.

## Development

```bash
# Install dependencies
yarn install

# Start dev server (http://localhost:5173/)
yarn dev

# Build
yarn build

# Type check
yarn typecheck

# Lint
yarn lint
```

## Test Prompts

Try these prompts to test the plugin:

1. "Create a budget spreadsheet with income and expenses columns"
2. "Make a multiplication table from 1 to 10"
3. "Create a spreadsheet to track monthly sales with SUM totals"

## License

MIT

## Related

- Protocol spec: [gui-chat-protocol](https://github.com/receptron/gui-chat-protocol)
- Reference implementations using this protocol: [mulmoclaude](https://github.com/receptron/mulmoclaude) · [MulmoChat](https://github.com/receptron/MulmoChat)
