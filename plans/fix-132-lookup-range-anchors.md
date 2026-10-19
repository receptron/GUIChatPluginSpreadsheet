# fix: VLOOKUP・HLOOKUP・INDEX が $ 付きや小文字の範囲を読めない（#132）

## 原因

`formulaRefs.ts` の `parseRangeBounds` が、`$` を外さず、大文字にもせずに `A1` の形として読んでいた。範囲を展開する `expandRange`・`expandRangeOrCell` は、どちらもしている。

## 直したこと

`parseRangeBounds` で、範囲の部分の `$` を外し、大文字にしてから読む。シート名の部分は書いたまま返す。

## テスト（`tests/engine/test_lookupRangeAnchors.ts`）

- `$` の付け方・小文字の例、シート名をそのまま返すこと、範囲でないもの
- #132 の VLOOKUP と HLOOKUP・INDEX
- 生成した範囲を、`$` の付け方と大文字小文字を変えて書き、境目と VLOOKUP・HLOOKUP・INDEX の答えが同じになる（種を表示する。`ANCHOR_SEED`）
- main のコードでは落ちる
