# 統計の関数を足す（#67）

## 足すもの（分類はすべて Statistical）

| 関数 | 決まり |
|---|---|
| `CORREL(y, x)` `SLOPE(y, x)` `INTERCEPT(y, x)` `RSQ(y, x)` | 二つの範囲を位置で対にし、どちらかが数値でない組は除く。範囲の大きさが違えば `#N/A`。残った組が 2 未満、またはばらつきが 0 なら `#DIV/0!` |
| `PERCENTILE(range, k)` | `PERCENTILE.INC` と同じ。`k*(n-1)` の位置で線形補間。`k` が 0〜1 の外、または値が無ければ `#NUM!` |
| `QUARTILE(range, q)` | `q` は切り捨てて 0〜4。`PERCENTILE(range, q/4)` |
| `LARGE(range, k)` `SMALL(range, k)` | `k` は切り上げ。1〜n の外なら `#NUM!` |
| `RANK(number, range, [order])` | `order` が 0 か省略なら大きい順。同じ値は同じ順位。範囲に無ければ `#N/A` |
| `STDEVP` `VARP` | 母集団（n で割る）。値が無ければ `#DIV/0!` |
| `SUMIFS(sum, range1, crit1, ...)` `COUNTIFS(range1, crit1, ...)` `AVERAGEIFS(avg, range1, crit1, ...)` | 条件は `SUMIF` と同じ `parseCriteria`。すべての条件に合う行だけ。範囲の大きさが違えば `#VALUE!`。`AVERAGEIFS` は数値でないセルを数えず、合う行が無ければ `#DIV/0!` |

## 作り

- 計算の決まりは `src/engine/functions/analysis-math.ts`（範囲を読まない純粋な関数）。テストは `tests/engine/test_analysisMath.ts`
- 範囲を読んで決まりに渡すのは `src/engine/functions/statistical-analysis.ts`。表を通したテストは `tests/engine/test_statisticalAnalysis.ts`
- 対にする関数と `*IFS` は、位置が意味を持つので `rawRangeReader` で読む（`getRangeValues` は数値でないセルを落とし、位置がずれる）
- README の Statistical の一覧に足す（`test_documentedFunctions.ts` が registry と照合する）

## 知っておくこと

- 行の長さがそろっていない表では、範囲の外のセルが読み取りから落ちるので、二つの範囲の大きさが違って見える。そのときは間違った組で計算せず、`#N/A`（対にする関数）か `#VALUE!`（`*IFS`）になる

## やらないこと

- `.INC` / `.EXC` の付いた名前
- 日付の関数（`EDATE` など）
