# fix: 名前に ' を含むシートへの参照を読む（#122）

## 原因

シート名を読むところが 2 か所あり、どちらも `''`（名前の中の `'` を重ねて書く Excel の書き方）を知らなかった。

- `calculator.ts` の `SHEET_QUALIFIED_REF`（`resolveSheetData` と `countFilledCells`）
- `evaluator.ts` の `matchQuotedSheetRef`（最初の `'` で名前が終わったとみなす）

## 直したこと

`src/engine/sheetReference.ts`（純粋な関数）に規則を一つ置き、上の 3 か所で使う。

- `splitSheetReference`：参照を、シート名とその中の参照に分ける。引用符の中の `''` は `'` に戻す
- `endOfQuotedSheetName`：引用符で始まるシート名の終わり。`''` は名前の一部

## テスト（`tests/engine/test_sheetReference.ts`）

- 分け方、引用符の終わり、#122 の表
- 生成した参照で、`''` を含まないものは、前の決まりとまったく同じに分かれる（種を表示する。`SHEET_REF_SEED`）
- 実装をわざと壊すと、テストが落ちる
