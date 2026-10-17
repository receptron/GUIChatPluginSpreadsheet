# ChangeLog

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
