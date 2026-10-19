# fix: 集計の関数に直接書いた文字・論理値の読み方（#116）

## 原因

`collectNumbersOrError`（前は `collectNumericValues`）が、直接書いた値も `toNumber` に通していた。`toNumber("x")` は 0 なので、"x" が 0 として足され、AVERAGE の数にも入った。論理値も 0 になっていた。

## 直したこと

直接書いた値（参照でない引数）は、`toScalarNumber` で読む。Excel の SUM・AVERAGE などの決まりと同じ。

- 論理値は 1 / 0
- 数として読める文字は、その数
- 読めない文字（`""` を含む）は #VALUE!

範囲や参照の中の文字・論理値・空は、今のまま飛ばす。COUNT は、直接書いた論理値と数の文字を数え、ほかの文字は数えない（誤りにしない）。

裸の `TRUE` が論理値になるのは #125 による。この PR は #125 の上で動く。

## 残すもの

- `"12abc"` は 12 として読まれる（エンジン全体の数の読み方 `parseNumericString`。Excel は #VALUE!）
- 式に `1/0` を直接書くと、関数より先に式全体が #DIV/0! になる（評価器の前からの決まり）

## テスト（`tests/engine/test_directArguments.ts`）

- #116 の表、各集計、COUNT、参照の中、引数の順
- 生成した引数で、テストの中で Excel の決まりから求めた答えと比べる（種を表示する。`DIRECT_ARGS_SEED`）
- `tests/engine/test_multiRangeAggregates.ts` の、前の決まり（COUNT(TRUE) が 0、SUM(1,"text") が 1）を書き留めていたテストを、Excel の答えに直した
