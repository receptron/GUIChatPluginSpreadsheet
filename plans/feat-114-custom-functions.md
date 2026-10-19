# 会話で作った関数を表の関数として使う（#114）

receptron/mulmoterminal#3097 の案 C。

## 決めたこと（#114 の推奨どおり）

- QuickJS（`quickjs-emscripten-core` と `@jitl/quickjs-singlefile-mjs-release-sync`）で、隔離して同期に走らせる。1 回 50ms、計算全体で 2 秒、メモリ 16MB。
- 置き場所は各シートの `functions`。どのシートに書いても表全体で使える。
- 範囲は 2 次元の配列（空のセルは `null`）。戻り値は数・文字・真偽値。時間切れと有限でない数は `#NUM!`、投げた誤りとそれ以外の戻り値は `#VALUE!`。
- 名前は `FUNCTION_NAME_SOURCE` のとおり（英字と数字、`.` でつなぐ）。#114 の本文にあった `_` は、式の側が読めないので使えない。組み込みと同じ名前は断る。
- 組み込みの関数表は全体で一つなので、表の関数は `functionRegistry.withOverlay` で計算の間だけ重ねる。`evaluator.ts` は触らない。組み込みが常に先に引かれる。
- 関数ごとに QuickJS の文脈を分ける。QuickJS の `Function` は本体を文字列としてつなぐので、本体が関数を早く閉じることはできる。それを閉じ込めるのは隔離と文脈の分離。

## 入れたもの

- `src/engine/customFunctionSpecs.ts`（純粋な検査）と `src/engine/customFunctions.ts`（QuickJS の器、`loadCustomFunctions`、`calculateWith`）。
- 型：`SpreadsheetSheet.functions`。ツールの入力と説明、システムプロンプト。
- `presentSpreadsheet` の返事に、使えない関数とその理由を書く。
- `readCalculatedRange`（グラフ）と View（`useCustomFunctions`）が、計算の前に関数を読み込む。
- QuickJS はビルドで外に出す（束ねると Node の `module` がブラウザ用に置き換わり、Node で動かなくなる）。

## 確かめたこと

- 単体と通しのテスト。範囲の形、別シートの範囲、引数の誤り、時間切れ、メモリの上限、隔離（fetch など）、関数ごとの大域、二つの表で同じ名前、組み込みを上書きできない、計算のあとに残らない、読み込みの追い越し。
- 守りを一つずつ外すと、どれもテストが落ちる。
- `dist` を Node で動かし、`presentSpreadsheet` の返事を確かめた。
- Chromium で View を開き、`=MOVING.AVG(A2:A6, 3)` が 400 になり、コンソールに誤りが無いことを確かめた（確かめ用のページは commit していない）。
