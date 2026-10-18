# README の関数一覧を登録済みの関数に合わせる（#59）

## 方針（issue の候補 1 + 3）
- README の「Supported Functions」を registry（`functionRegistry.getFunctionsByCategory()`）の分類と関数に合わせて書き直す。見出しは registry の `category` をそのまま使う（`SUM` / `AVERAGE` は Statistical になる）
- `tests/engine/test_documentedFunctions.ts` で、次がずれたら落ちる
  - README の分類ごとの関数一覧 = registry（両方向）
  - モデル向けの説明（`SYSTEM_PROMPT` / `TOOL_DEFINITION`）が呼ぶ・挙げる関数はすべて登録済み
  - 同梱のサンプルの数式が呼ぶ関数はすべて登録済み

## 見つかった不具合（レビューで判明）
- 登録済みの `LOG10` が `#ERROR!` になっていた。評価器の関数名の判定 2 か所（`evaluator.ts`）と `looksLikeFormula`（`cellBuilder.ts`）が英字だけを受け付けていたため。3 か所とも「英字で始まり英数字が続く」にした。`test_mathematicalFunctions.ts` と `test_cellBuilder.ts` に、それぞれの箇所だけを戻すと落ちるテストを足した

## テストの拾い方
- 説明（`SYSTEM_PROMPT` / `TOOL_DEFINITION`）は全文から `名前(` を大文字小文字を問わず拾う。数式だけを切り出すと、引用符付きの引数のあとの呼び出しを見落とす
- サンプルはセルの値をたどって `=` で始まる文字列を集める
- README の分類の見出しが重複したら落とす（`Map` が上書きするため）
- 改行は CRLF を `\n` にそろえてから読む（Windows の checkout）

## やらないこと
- 未登録の関数（CORREL など）を足すこと（issue の候補 2）

## 確かめたこと
README を元に戻す・関数を消す・見出しを重複させる・小文字の未登録名を足す、説明とサンプルに未登録の関数（大文字・小文字・引用符付き引数のあと）を足す、のどれでも該当のテストが落ちる。
