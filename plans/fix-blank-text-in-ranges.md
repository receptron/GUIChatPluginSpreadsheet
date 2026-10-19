# 空のセル・文字・TRUE/FALSE を 0 として数えない（#103）

## 見つけ方

統計と条件付きの関数を、生成した列（数・空・文字・TRUE/FALSE を混ぜる）で、Excel の決まりで書いた計算と突き合わせた。それで #103 の表の食い違いが出た。

## 直したこと

- `calculator.ts`：空のセルを `""` として残す読み方 `getRangeValuesKeepingBlanks` を足した。数だけを読む範囲から、TRUE / FALSE を外す。
- `evaluator.ts` と `registry.ts`：その読み方を関数に渡す（`blankAwareRangeReader`）。条件・対・COUNTA だけがそれを使い、参照（INDEX・VLOOKUP・MATCH）は今のまま、空を 0 として読む。
- `parseCriteria`：
  - 大小の比較と数の一致は、数を持つ値だけに当てる。
  - 文字の型は数に当てない。
  - `=` だけは空のセルに、`<>` だけは空でないセルに当てる。
- AVERAGEIF は、合った値のうち数だけで割る。

## テスト

- `tests/engine/test_blankAndTextInRanges.ts`：#103 の各場合を一つずつ書いた。
- `tests/engine/test_statisticsGenerated.ts`：生成した列で、各関数を Excel の決まりで書いた計算と比べる。種を表示し、`STATISTICS_SEED=<seed>` で同じ列を作り直せる。
- `tests/engine/test_registry.ts`：「`0` の条件が文字に当たる」と前の動きを書き留めていたテストを、直した動きに変えた。
- 直した箇所を一つずつ元に戻すと、どれも新しいテストが落ちることを確かめた。

## 直していないもの

- `RANK` の対象が TRUE のセルのとき。Excel の答えを確かめられていないので、今のまま。
- セルの文字を数として読む寛容な読み方（`"12abc"` を 12 と読む）は、前からの決めごとなので変えていない。
