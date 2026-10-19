# feat: 回帰と予測、共分散、条件付きの最大・最小を足す（#98 の 2 と MAXIFS/MINIFS）

## 足すもの

- `FORECAST.LINEAR`（別名 `FORECAST`）
- `TREND`（新しい x が 1 つのときだけ。配列を返す形は #98 で対象外）
- `STEYX`
- `COVARIANCE.P`・`COVARIANCE.S`
- `PEARSON`（`CORREL` の別名）
- `MAXIFS`・`MINIFS`

## 作り

- `regression-math.ts`（純粋な関数）：直線の値、回帰の標準誤差、共分散、TREND の当てはめ。平均からのずれで計算する（大きな値で桁が落ちない）。STEYX は残差を一つずつ足す。`Syy − Sxy²/Sxx` では、よく合う直線ほど打ち消し合って桁が落ちた（測った）
- `regression.ts`：引数を読み、登録する。対にする読み方は、#104 の後の `CORREL` と同じ（`pairsFrom`、空と文字の行は外す）
- `MAXIFS`・`MINIFS` は `statistical-analysis.ts` の SUMIFS の隣。合った行のうち数を持つ値の最大・最小。一つも無ければ 0（Excel と同じ）
- Excel の誤り：
  - FORECAST・STEYX・COVARIANCE：大きさの違う範囲は `#N/A`。組が一つも無いとき、FORECAST と STEYX は `#N/A`、COVARIANCE は `#DIV/0!`。x が変わらない、STEYX の点が 3 つ未満、COVARIANCE.S の点が 2 つ未満は `#DIV/0!`
  - TREND は LINEST と同じく範囲を丸ごと読む。大きさの違う範囲は `#REF!`、空や文字のセルは `#VALUE!`、誤りのセルはその誤り。x が変わらないときは LINEST がその列を外すのにならい、y の平均（原点を通すなら 0）

## 確かめたこと

- Microsoft の計算例（FORECAST.LINEAR・STEYX・COVARIANCE.P/.S・MAXIFS/MINIFS）
- 正確な参照値：`tests/tools/generate_regression_reference.py` が有理数で計算する（入力の小数をそのまま真の値として扱う）。`uv run` で作り直せる。相対誤差 1e-9 で突き合わせる。値の大きな x（1e6 前後）も入れて、桁落ちを確かめる
- 式に頼らない性質（種を表示する。`REGRESSION_SEED`）：
  - 直線は平均の点を通る
  - TREND（定数あり）は FORECAST と同じ
  - COVARIANCE.S·(n−1) = COVARIANCE.P·n
  - 同じ範囲どうしの COVARIANCE.P は VAR.P
  - 直線の上の点なら STEYX は 0
  - y を 4 倍すると STEYX も 4 倍
- 引数の決まり、空や文字の行の扱い
- 実装をわざと壊すと、テストが落ちる

## 確かめていないこと

- TREND の空のセルと、x が変わらない場合の Excel の答え。LINEST の説明と、知られている動きに合わせたが、Excel で実際には確かめていない
