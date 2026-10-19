# fix: 空のセルを関数の引数や比較で読むと 0 になる（#99）

## 原因

- 関数の引数は `evaluateFormula("A1")` で読まれ、参照一つだけの式は `getCellValue` の値（空なら 0）を返す。文字の関数は、その 0 を "0" にしていた
- 比較の片側も、差し込まれた 0 を読んでいた

## 直したこと

- 比較：差し込みの前に、一番外側の比較の各辺が「空のセルへの参照だけ」かを調べる（`evaluator.ts` の `blankComparisonSides`、`loneReference`）。その辺は、相手が数なら 0、文字なら ""、論理値なら FALSE として比べる（`blankOperands.ts` の `blankBeside`・`withBlankSides`）。`blankBeside` は #111 の IFS が使っていたもので、`condition.ts` から移して共有する
- 文字の関数：関数の文脈に `isBlankReference` を渡す。CONCATENATE・CONCAT・LEN・LEFT・RIGHT・MID・UPPER・LOWER・PROPER・TRIM・SUBSTITUTE・REPLACE・FIND・SEARCH・EXACT は、空のセルへの参照だけの引数を "" として読む（`text.ts` の `textOf`・`textArg`）
- 変えないもの：`=A1` だけの式（0）、計算の中（`=A1+1` は 1）、数として読む VALUE・TEXT の値・数の関数

## 残る違い

- `""` を返す式のセル（`=IF(TRUE,"",1)`）は、参照すると 0 として読まれる（#111 で IF と IFS をそろえた決まり）。そのため `=C1=0` は TRUE になる（Excel は FALSE）。`=C1=""` は TRUE（Excel と同じ）

## テスト（`tests/engine/test_blankArguments.ts`）

- #99 の表、比較、文字の関数、変えないもの、0 や文字のセルとの違い
- 生成した比較で、空のセルが、Excel がそれとして読む値（0・""・FALSE）を書いた式と同じ答えになる（種を表示する。`BLANK_ARGS_SEED`）
- 生成した文字の関数で、空のセルが "" と同じ答えになる
- main のコードでは 5 つのテストが落ちる
