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
`ABS`, `CEILING`, `EXP`, `FLOOR`, `INT`, `LN`, `LOG`, `LOG10`, `MOD`, `PI`, `POWER`, `ROUND`, `ROUNDDOWN`, `ROUNDUP`, `SIGN`, `SQRT`, `TRUNC`

### Text
`CONCAT`, `CONCATENATE`, `EXACT`, `FIND`, `LEFT`, `LEN`, `LOWER`, `MID`, `PROPER`, `REPLACE`, `RIGHT`, `SEARCH`, `SUBSTITUTE`, `TEXT`, `TRIM`, `UPPER`, `VALUE`

### Date & Time
`DATE`, `DATEDIF`, `DAY`, `DAYS`, `EDATE`, `EOMONTH`, `HOUR`, `MINUTE`, `MONTH`, `NETWORKDAYS`, `NOW`, `SECOND`, `TIME`, `TODAY`, `WEEKDAY`, `WORKDAY`, `YEAR`

A formula without a format code shows its number as a date only when the number is a date by origin: the formula starts with DATE, TODAY, EDATE, EOMONTH or WORKDAY, or its first reference is a date (a cell with a date format, typed as a date, or itself such a formula, on any sheet). A total that lands on 52,345 stays a number. Give a formula a format code to choose its display yourself.

A date format code is read as Excel reads it, for a cell's display and for TEXT alike: letters in any case (yyyy-mm-dd or YYYY-MM-DD), and m or mm as minutes when the part before it is an hour or the part after it a second (h:mm, h"時"mm"分"), the month otherwise.

Dates are serial numbers on the real calendar, as in LibreOffice and Google Sheets. Excel counts a 1900-02-29 that never existed, so a serial before 61 (1900-03-01) is one day earlier here than in Excel; from 61 on they are the same.

### Logical
`AND`, `FALSE`, `IF`, `IFERROR`, `IFNA`, `IFS`, `NOT`, `OR`, `TRUE`

### Lookup & Reference
`COLUMN`, `COLUMNS`, `HLOOKUP`, `INDEX`, `MATCH`, `ROW`, `ROWS`, `VLOOKUP`, `XLOOKUP`

A range is written `A1:C10`, `Data!A1:C10` or `'My Sheet'!A1:C10`. A whole column (`A:A`, `B:D`) or a whole row (`1:1`) covers its sheet as far as the data reaches, which gives the same answers, since everything past the data is blank. `ROW()` and `COLUMN()` give the number of the cell the formula is in; given a range, they answer for its first cell.

### Statistical
`AVEDEV`, `AVERAGE`, `AVERAGEA`, `AVERAGEIF`, `AVERAGEIFS`, `CONFIDENCE.NORM`, `CONFIDENCE.T`, `CORREL`, `COUNT`, `COUNTA`, `COUNTBLANK`, `COUNTIF`, `COUNTIFS`, `COVARIANCE.P`, `COVARIANCE.S`, `DEVSQ`, `FORECAST`, `FORECAST.LINEAR`, `GEOMEAN`, `HARMEAN`, `INTERCEPT`, `KENDALL`, `KURT`, `LARGE`, `MAX`, `MAXA`, `MAXIFS`, `MEDIAN`, `MIN`, `MINA`, `MINIFS`, `MODE`, `MODE.SNGL`, `NORM.DIST`, `NORM.INV`, `NORM.S.DIST`, `NORM.S.INV`, `PEARSON`, `PERCENTILE`, `PERCENTILE.EXC`, `PERCENTILE.INC`, `PERCENTRANK`, `PERCENTRANK.EXC`, `PERCENTRANK.INC`, `PROB`, `QUARTILE`, `QUARTILE.EXC`, `QUARTILE.INC`, `RANK`, `RANK.AVG`, `RANK.EQ`, `RSQ`, `SKEW`, `SKEW.P`, `SLOPE`, `SMALL`, `SPEARMAN`, `STANDARDIZE`, `STDEV`, `STDEV.P`, `STDEV.S`, `STDEVP`, `STEYX`, `SUM`, `SUMIF`, `SUMIFS`, `T.DIST`, `T.DIST.2T`, `T.DIST.RT`, `T.INV`, `T.INV.2T`, `T.TEST`, `TREND`, `TRIMMEAN`, `TTEST`, `VAR`, `VAR.P`, `VAR.S`, `VARP`

### Financial
`FV`, `IPMT`, `IRR`, `NPER`, `NPV`, `PMT`, `PPMT`, `PV`, `RATE`

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
- Return a number, text or `true`/`false`. A time-out or a non-finite number shows `#NUM!`; a thrown error or any other return value shows `#VALUE!`.
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
