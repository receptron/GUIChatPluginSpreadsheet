# feat: 検定と分布の関数を足す（#98 の 1）

## 足すもの

`T.TEST`（別名 `TTEST`）、`T.DIST`・`T.DIST.2T`・`T.DIST.RT`、`T.INV`・`T.INV.2T`、`NORM.DIST`・`NORM.S.DIST`・`NORM.INV`・`NORM.S.INV`、`CONFIDENCE.NORM`・`CONFIDENCE.T`。#98 の 2（回帰と予測）と 3（分布の形とグループの集計）は別の PR。

## 作り

- `special-functions.ts`：対数ガンマ（Lanczos と Stirling）、対数ベータ（片方の引数が大きいときは R の lbeta と同じ分け方）、正則化不完全ベータ（連分数。形の引数が 1e4 を超え 1 − x が小さいときは冪級数）、正則化不完全ガンマ
- `distribution-math.ts`：t 分布と正規分布の密度・裾・逆関数、t 検定の統計量。裾は直接計算し、`1 − 小さな値` を作らない。t の裾は ln(ν/t²) から ln x と ln(1 − x) を作り、t² の溢れと 0 への落ち込みを避ける
- `distributions.ts`：引数の決まり。自由度・tails・type・size は切り捨て、範囲外は `#NUM!`
- 関数名の決まり（`FUNCTION_NAME_SOURCE`）を、`.` のあとが数字で始まる部分（`.2T`）も許す形に広げる

## 決まったことから変えたこと

issue では「期待値は `jstat` で作る」と決めていたが、`jstat` を測ると基準の 1e-9 に届かなかった（t の累積が自由度 1・2 の式と比べて 3.6e-8、正規分布の z = −8 の裾が 2% ずれる）。代わりに mpmath で 50 桁の参照値を作り、表（`tests/engine/fixtures/distribution-reference.json`）にする。表を作るスクリプトは `tests/tools/generate_distribution_reference.py`（`uv run` で動く）。テストを回すのに Python は要らない。`jstat` は入れない。

## 精度

- 自由度 1e7 まで：参照値と相対誤差 1e-9 以内
- 自由度 1e7 を超え、|t| > 4 の右の裾：連分数が x → 1 で桁を落とし、自由度 1e9 で 2e-8 ほど（測った値）。テストは 3e-8 で固定。1e-9 にするには、形の引数が巨大なときの展開（DiDonato–Morris の BGRAT など）が要る

## 確かめたこと

- 50 桁の参照値（t の裾・密度・逆関数、正規分布の裾・密度・逆関数、T.TEST、対数ガンマ・対数ベータ）との照らし合わせ
- 式で書ける形（自由度 1 の Cauchy、自由度 2）、逆関数を通して元に戻ること（種を表示する。`DISTRIBUTION_SEED`）、Microsoft の説明の計算例
- 引数の決まり（切り捨て、`#NUM!`、`#N/A`、`#DIV/0!`、誤りの引数がそのまま返ること）
- 関数名の決まりを広げても、新しい関数を含まない式は古い実装と同じ答えになる（作った式で比べた）
- 実装をわざと壊すと、テストが落ちる。すり抜けた壊し方は、働いていないコードだったので消した
