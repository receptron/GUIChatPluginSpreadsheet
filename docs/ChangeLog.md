# ChangeLog

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
