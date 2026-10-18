# 開いている表の画面が、ファイルの変更を読み直す（#74）

- 画面は、runtime があれば `useRuntime().pubsub.subscribe("file:<path>")` で自分のファイルを購読する。表が切り替わったら購読し直し、外すときに解除する。
- 知らせが来たら読み直す。どうするかは `fileChangeAction`（`src/vue/fileFollow.ts`）が決める。
  - `same`：画面と同じ中身（多くは自分の保存の知らせ）。何もしない。
  - `apply`：新しい中身を出す。
  - `hold`：Edit Spreadsheet Data に適用していない編集がある。上書きせずに、知らせを出す。
- ホストは、scope `spreadsheet` で表のファイルを見張る（MulmoTerminal は `server/backends/files/fileChange.ts`）。

## 確かめたこと

MulmoTerminal に手元でビルドしたものを入れ、画面を開いたままファイルを直接書き換えた。

- 画面が新しい中身になった。
- そのあと画面でセルを直しても、外からの書き換えが残った。
- JSON の編集が適用前のときは、表を変えずに知らせが出た。
