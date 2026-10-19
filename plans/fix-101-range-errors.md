# fix: 範囲の集計が、計算の誤りのセルを飛ばす（#101）

## 原因

集計の関数は、数だけを読む読み方（`getRangeValues`）で範囲を読む。この読み方は、空のセル（`isEmptyCell`）と数でない値（`isRangeNumber`）を飛ばす。計算済みの誤りは `v` の無いオブジェクトなので空と数えられ、値としても数でないので、どちらの条件でも外れていた。issue の見立ては、その片方に当たる。

## 直したこと

集計の関数は、引数を一度だけ読み、その読みで「数の並び」か「最初の誤り」を返す（`statistical.ts` の `collectNumbersOrError`・`overNumbers`）。誤りは、引数の順、範囲の中は読む順で探す。

- SUM・AVERAGE・MAX・MIN・MEDIAN・MODE・STDEV・VAR・STDEVP・VARP
- LARGE・SMALL・PERCENTILE・QUARTILE・RANK（範囲を先に読み、順位の向きはその後）
- 対の関数（`pairsFrom`）：CORREL・SLOPE・INTERCEPT・RSQ・FORECAST.LINEAR・STEYX・COVARIANCE
- 条件付きの集計：SUMIF・AVERAGEIF・SUMIFS・AVERAGEIFS・MAXIFS・MINIFS。合った行の値が誤りなら、最初のものが答え。合わない行の誤りと、条件の範囲の誤りは読まない（Excel と同じ）
- SKEW など（`shape.ts`）と T.TEST（`distributions.ts`）も、誤りを探す読みと計算の読みの二度読みをやめた

COUNT・COUNTIF(S) は誤りを数えず、COUNTA は数える（Excel と同じ。前から）。

## テスト（`tests/engine/test_rangeErrors.ts`）

- #101 の表
- 各関数で、範囲の誤りが答えになる
- 引数の順、範囲の中の読む順で、最初の誤りが答えになる
- COUNT・COUNTA
- 誤りの無い範囲は前のまま
- 生成した範囲で、最初の誤りが答えになる（種を表示する。`RANGE_ERRORS_SEED`）
- 包みを一つ外すと、どの関数でもテストが落ちる
