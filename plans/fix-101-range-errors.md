# fix: 範囲の集計が、計算の誤りのセルを飛ばす（#101）

## 原因

集計の関数は、数だけを読む読み方（`getRangeValues`）で範囲を読む。この読み方は数でないセルを飛ばすので、誤りのセルも飛ばしていた。issue の見立て（`isEmptyCell` が誤りを空と数える）は、数だけを読む道では当たらない（#104 の `isRangeNumber` が誤りを数と見ない）。飛ばしていたのは「数でない」という理由だった。

## 直したこと

`statistical.ts` に、引数の中の最初の誤りを返す決まりを一つ足した（`firstArgumentError`）。範囲の誤りのセルも、誤りになった引数も見る。それを関数の前に置く包み（`answeringArgumentErrors`）を、次の関数に付けた。

- SUM・AVERAGE・MAX・MIN・MEDIAN・MODE・STDEV・VAR（と別名）
- STDEVP・VARP
- LARGE・SMALL・PERCENTILE・QUARTILE
- CORREL・SLOPE・INTERCEPT・RSQ

COUNT は誤りを数えず、COUNTA は数える（Excel と同じ。前から）。

## 対象外

- 条件付きの集計（SUMIF・SUMIFS・AVERAGEIF(S)・COUNTIF(S)）。Excel は、合った行の値の誤りを返し、条件の範囲の誤りは「合わない」とする。読み方が違うので、別にする
- RANK の範囲の誤り。Excel の答えを確かめられていない

## テスト（`tests/engine/test_rangeErrors.ts`）

- #101 の表
- 各関数で、範囲の誤りが答えになる
- 引数の順、範囲の中の読む順で、最初の誤りが答えになる
- COUNT・COUNTA
- 誤りの無い範囲は前のまま
- 生成した範囲で、最初の誤りが答えになる（種を表示する。`RANGE_ERRORS_SEED`）
- 包みを一つ外すと、どの関数でもテストが落ちる
