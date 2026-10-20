# feat: 記述統計の残りを足す（#153）

## 足すもの

- 平均とばらつき：`TRIMMEAN`・`AVEDEV`・`DEVSQ`・`SKEW.P`
- 分位：`PERCENTILE.EXC`・`QUARTILE.EXC`・`PERCENTRANK.EXC`
- 順位：`RANK.AVG`
- 最頻値：`MODE.SNGL`（`MODE` の別名）
- 確率：`PROB`
- 数え方の違い：`COUNTBLANK`・`AVERAGEA`・`MAXA`・`MINA`
- Excel に無い順位相関：`SPEARMAN`・`KENDALL`（範囲を二つ受け取る）

## 決めたこと

- 順位相関は、配列の結果（#148）を待たずに関数として持つ。名前は `SPEARMAN` と `KENDALL`。Excel・LibreOffice・Google スプレッドシートのどれにも無いので、短い名前にした
- `KENDALL` は τ-b（同順位を分母から除く。scipy の既定と同じ）
- `PROB` の確率の合計は、1 との差が 1e-9 以内なら 1 とみなす（0.1 + 0.2 + 0.7 が 1 にならないため）

## 作り

- `descriptive-math.ts`（純粋な関数）と `descriptive.ts`（引数を読んで登録する）
- 範囲の読み方は、ほかの集計と同じ一度の読み（`collectNumbersOrError`）と、対の読み（`pairsFrom`）。範囲の誤りはどちらも最初のものを返す
- `AVERAGEA`・`MAXA`・`MINA` は、範囲の中の文字を 0、論理値を 1 / 0 として数え、空は飛ばす

## テスト（`tests/engine/test_descriptive.ts`）

- Microsoft の計算例
- numpy と scipy の値（`tests/tools/generate_descriptive_reference.py`、`uv run` で作り直せる）との比較
- 引数の決まり
- 性質（種を表示する。`DESCRIPTIVE_SEED`）
