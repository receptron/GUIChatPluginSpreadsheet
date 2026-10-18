# 表の範囲を計算した値で読む（#69）

グラフが表の範囲を指し、表を直すとグラフも変わるようにする（receptron/mulmoterminal#3096 の案 A）。その最初の部品として、計算した範囲を `./core` から読めるようにする。

## 公開するもの（`src/core/rangeValues.ts`）

- `calculatedRange(sheets, range)`：範囲の値を行ごとの二次元配列で返す。範囲が読めない、シートが無い、セルが多すぎるときは投げる
- `readCalculatedRange(artifacts, path, range)`：`isSpreadsheetArtifactPath` を通ったパスだけを `files.artifacts` で読む
- `MAX_RANGE_CELLS`、`RangeCell`

## 値の決まり（`rangeCellValue`）

- 表示の値が数値なら、そのまま
- 計算した値が数値で、セルの書式が数値の書式（日付や時刻の文字 `y m d h s` を含まない）なら、計算した値。`1,200` や `60.0%` を描ける数にする
- それ以外は表示の値。日付は見えている文字（`2026-01-15`）、エラーはコード、真偽値は `TRUE` / `FALSE`
- 空と、データの外は `null`

## 作り

- 計算は、指されたシートだけを `calculateSheet` で 2 回（書式を付けない回と付ける回）。他のシートは、シートをまたぐ参照のために渡す
- `calculateSheet` の `skipFormatting` は、エンジンの中で使う引数。同じパッケージの中から使い、外には出さない
- エンジンは `../engine` の入口から読む。関数を登録するのはこの入口なので、`calculator.ts` だけを読むと `SUM` が `#NAME?` になる

## 範囲の書き方

`Data!B2:C13`、`'Q1 Data'!A1:B5`、`A1:B5`（最初のシート）、`B2`（一つのセル）。角が逆でもよい。列だけ・行だけ（`A:A`、`1:3`）は受け付けない。
