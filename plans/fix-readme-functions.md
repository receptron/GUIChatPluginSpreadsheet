# README の関数一覧を登録済みの関数に合わせる（#59）

## 方針（issue の候補 1 + 3）
- README の「Supported Functions」を registry（`functionRegistry.getFunctionsByCategory()`）の分類と関数に合わせて書き直す。見出しは registry の `category` をそのまま使う（`SUM` / `AVERAGE` は Statistical になる）
- `tests/engine/test_documentedFunctions.ts` で、次がずれたら落ちる
  - README の分類ごとの関数一覧 = registry（両方向）
  - モデル向けの説明（`SYSTEM_PROMPT` / `TOOL_DEFINITION`）が呼ぶ・挙げる関数はすべて登録済み
  - 同梱のサンプルの数式が呼ぶ関数はすべて登録済み

## やらないこと
- 未登録の関数（CORREL など）を足すこと（issue の候補 2）

## 確かめたこと
README を元に戻す・関数を 1 つ消す、説明に未登録の関数を足す、サンプルに未登録の関数を足す、の 4 通りでそれぞれ該当のテストが落ちる。
