# @gui-chat-plugin/spreadsheet

[![npm version](https://badge.fury.io/js/%40gui-chat-plugin%2Fspreadsheet.svg)](https://www.npmjs.com/package/@gui-chat-plugin/spreadsheet)

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
- Excel file import/export (.xlsx)
- Cell formatting and styling

## Installation

```bash
yarn add @gui-chat-plugin/spreadsheet
```

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
// or
import pluginCore from "@gui-chat-plugin/spreadsheet";
```

## Package Exports

| Export | Description |
|--------|-------------|
| `@gui-chat-plugin/spreadsheet` | Core (framework-agnostic) |
| `@gui-chat-plugin/spreadsheet/vue` | Vue implementation with UI components |
| `@gui-chat-plugin/spreadsheet/style.css` | Tailwind CSS styles |

## Supported Functions

### Mathematical
`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, `COUNTA`, `ABS`, `ROUND`, `FLOOR`, `CEILING`, `POWER`, `SQRT`, `MOD`, `RAND`, `RANDBETWEEN`, `PI`

### Text
`CONCATENATE`, `LEFT`, `RIGHT`, `MID`, `LEN`, `UPPER`, `LOWER`, `PROPER`, `TRIM`, `SUBSTITUTE`, `REPLACE`, `TEXT`, `VALUE`, `FIND`, `SEARCH`, `REPT`

### Date & Time
`TODAY`, `NOW`, `DATE`, `YEAR`, `MONTH`, `DAY`, `HOUR`, `MINUTE`, `SECOND`, `WEEKDAY`, `DAYS`, `EDATE`, `EOMONTH`, `WORKDAY`, `NETWORKDAYS`, `DATEDIF`

### Logical
`IF`, `AND`, `OR`, `NOT`, `TRUE`, `FALSE`, `IFERROR`, `IFNA`, `IFS`, `SWITCH`, `XOR`

### Lookup
`VLOOKUP`, `HLOOKUP`, `INDEX`, `MATCH`, `OFFSET`, `INDIRECT`, `ROW`, `COLUMN`, `ROWS`, `COLUMNS`, `TRANSPOSE`

### Statistical
`MEDIAN`, `MODE`, `STDEV`, `STDEVP`, `VAR`, `VARP`, `LARGE`, `SMALL`, `RANK`, `PERCENTILE`, `QUARTILE`, `CORREL`, `COUNTIF`, `COUNTIFS`, `SUMIF`, `SUMIFS`, `AVERAGEIF`, `AVERAGEIFS`

### Financial
`PMT`, `PV`, `FV`, `NPV`, `IRR`, `RATE`, `NPER`, `IPMT`, `PPMT`, `SLN`, `DB`, `DDB`

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
