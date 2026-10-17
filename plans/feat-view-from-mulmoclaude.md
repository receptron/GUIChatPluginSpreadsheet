# View を MulmoClaude 版に揃える（#36）

## 目的

MulmoClaude の `src/plugins/spreadsheet/View.vue` に揃え、どのホストでも同じ View を使えるようにする。ホスト依存だった二つ（保存と多言語対応）は gui-chat-protocol の汎用の仕組みに置き換える。

## 設計

### 保存（`@mulmoclaude/html-plugin` と同じ形）

- 道具としての呼び出し（`kind` なし）
  - `context.files.artifacts` があれば、表を `spreadsheets/YYYY/MM/<16桁の16進>.json` に書き、`data.sheets` には `artifacts/spreadsheets/…json` を返す。保存形式は MulmoClaude と同じ（シート配列の JSON）
  - なければ従来どおり中身をそのまま返す（MulmoChat など）
  - `message` に保存先を書き、Claude が後で編集結果を読み返せるようにする
- 画面からの `dispatch`
  - `{ kind: "loadSpreadsheet", path }` → `{ message, data: { sheets } }`
  - `{ kind: "saveSpreadsheet", path, sheets }` → 書き込んで `{ message, data: { sheets: path } }`
  - パスは `artifacts/spreadsheets/` 配下の `.json` だけ。`.` / `..` / 空の区切り / `\` は拒否。書く前にシートの形を確かめる
- `pluginCore.execute` が `kind` で振り分ける。MulmoTerminal は View の `dispatch` を同じ `execute` に流すので、登録だけで動く。MulmoClaude 向けに `executeSpreadsheetDispatch` / `isSpreadsheetDispatchArgs` も単独で出す
- `context.files` は `ToolContext` の型にないので、型の守りで取り出す（`as` を使わない）

### 多言語対応

- `src/lang/` に MulmoClaude の 8 言語の訳を移し、`createUseT` で引く。数の入る文言は関数にする（chart-plugin と同じ）
- 日付の日/月の順は、ホストから受け取る言語で `prefersDayFirst` を決める

### View

- MulmoClaude 版を元にする。`vue-i18n` → `useT`、MulmoClaude の API → `useRuntime().dispatch`
- ホストの runtime がない場合（MulmoChat など）は、中身をそのまま持つ形だけ扱う
- MulmoClaude 固有の外部リンク処理（`handleExternalLinkClick`）は runtime の `openUrl` で置き換える

### ビルド

- `gui-chat-protocol` を外部扱いにする。`createUseT` / `useRuntime` は `PLUGIN_RUNTIME_KEY`（Symbol）で注入を受けるので、同梱するとホストの Symbol と別物になり、runtime が見つからなくなる
- `peerDependencies` の `gui-chat-protocol` を `^2.3.0` に上げる（`ARTIFACTS_ROOT`）

## やらないこと

- `<style scoped>` の Tailwind 化。MulmoClaude 版と同じ見た目・同じ中身で揃えることを優先し、別に行う
- xlsx の読み込み

## 確認

- `yarn typecheck` / `yarn lint` / `yarn build` / `yarn test:all`
- 純粋部分（パス、シートの形の守り、`execute` と `dispatch`）は `tests/core/` に node:test で書く。偽の `FileOps` で読み書きを確かめる
- デモ画面で、中身をそのまま持つ形の表示・編集が今までどおり動くこと
