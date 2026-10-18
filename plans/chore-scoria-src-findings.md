# src のコードスキャン警告を直す（#54）

## 直したもの
- `calculator.ts`：`collectRangeValues` の引数 `options` を `rangeOptions` に（外側の `options` を隠していた）
- `lookup.ts`：外側の変数を使わない `compare` をモジュール最上位へ
- `plugin.ts`：文字列の sheets のパース失敗を投げ直すとき `cause` を付ける。`new Error(msg, { cause })` の型のため tsconfig の `lib` を ES2022 に（`target` は ES2020 のまま。古い実行環境では第 2 引数が無視されるだけ）
- `financial.ts`：FV / PV / PMT / NPER / RATE / IPMT / PPMT の引数読み取りを `readNumericArgs` に。評価順（必須 → 省略可能、左から）は変えない
- `text.ts`：FIND / SEARCH を `makeLocateHandler(caseInsensitive)` に
- `condition.ts`：`stripOuterParens` と `splitComparison` が持っていた「引用符の外側だけを走査する」部分を `unquotedIndices` ジェネレーターに

## 動作が変わらないことの確かめ方
旧コード（変更前の `src` を丸ごと取り出したもの）と新コードを並べ、生成した入力で結果を比較した。
- ハンドラー：引数列（長さ 0〜4 は全組み合わせ、5〜7 は乱数）× 9 関数。戻り値・投げたエラー・`evaluateFormula` の呼び出し順を比較
- 条件：記号 11 種からなる長さ 5 までの全文字列と乱数の長い文字列で `stripOuterParens` / `splitComparison` を比較
- 比較器自体の検査：変更行を 1 つずつ壊して差分が出ることを確認。FIND の大文字小文字を逆にする変更は最初の生成器では検出できず、大文字小文字で結果が変わる値を足して検出できるようにした。引用符の文字も走査対象に含める変更は差分が出ないが、引用符は括弧でもどの演算子の先頭文字でもないため、どの入力でも結果が変わらない
- `lookup.ts` の `compare` と `calculator.ts` の名前変更は比較していない（閉包が外側の変数を使っていないこと、名前変更であることを型検査とテストで確認）

## 直さないもの
- `toSorted` / `toReversed`（statistical-math / evaluator）：どちらもコピーに対して呼んでおり元の配列は変わらない。置き換えると対応ブラウザの下限が上がる
- `View.vue` の god-file / style-block、`calculator.ts` と `View.vue` の重複：View を MulmoClaude と同じに保つため
- `calculator.ts` の TODO：機能追加が要る
