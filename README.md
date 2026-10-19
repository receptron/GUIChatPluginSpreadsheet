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

Dates are serial numbers on the real calendar, as in LibreOffice and Google Sheets. Excel counts a 1900-02-29 that never existed, so a serial before 61 (1900-03-01) is one day earlier here than in Excel; from 61 on they are the same.

### Logical
`AND`, `FALSE`, `IF`, `IFERROR`, `IFNA`, `IFS`, `NOT`, `OR`, `TRUE`

### Lookup & Reference
`HLOOKUP`, `INDEX`, `MATCH`, `VLOOKUP`, `XLOOKUP`

### Statistical
`AVERAGE`, `AVERAGEIF`, `AVERAGEIFS`, `CONFIDENCE.NORM`, `CONFIDENCE.T`, `CORREL`, `COUNT`, `COUNTA`, `COUNTIF`, `COUNTIFS`, `INTERCEPT`, `LARGE`, `MAX`, `MEDIAN`, `MIN`, `MODE`, `NORM.DIST`, `NORM.INV`, `NORM.S.DIST`, `NORM.S.INV`, `PERCENTILE`, `PERCENTILE.INC`, `QUARTILE`, `QUARTILE.INC`, `RANK`, `RANK.EQ`, `RSQ`, `SLOPE`, `SMALL`, `STDEV`, `STDEV.P`, `STDEV.S`, `STDEVP`, `SUM`, `SUMIF`, `SUMIFS`, `T.DIST`, `T.DIST.2T`, `T.DIST.RT`, `T.INV`, `T.INV.2T`, `T.TEST`, `TTEST`, `VAR`, `VAR.P`, `VAR.S`, `VARP`

### Financial
`FV`, `IPMT`, `IRR`, `NPER`, `NPV`, `PMT`, `PPMT`, `PV`, `RATE`

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
