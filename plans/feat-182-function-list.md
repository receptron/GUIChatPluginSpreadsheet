# 登録済みの関数の一覧を ./core から出す（#182）

## 方針
- `src/core/functionList.ts` に二つ置き、`./core` から出す
  - `registeredFunctionsByCategory()`：分類 → 関数名（並べ替え済み）。`internal` は除く。README の一覧と同じ分け方（`getFunctionsByCategory()` をそのまま使う）
  - `isRegisteredFunction(name)`：`isBuiltIn` を使う。ブックの関数（計算中だけ見える overlay）は含めない。ホストの説明文に載せてよいのはエンジン自身の関数だけのため
- README の一覧を確かめる `tests/engine/test_documentedFunctions.ts` は、自前の組み立てをやめてこの二つを使う

## 使う側
- receptron/mulmoclaude#3498：ヘルプの関数一覧のずれを止めるテストが、内蔵版の `functionRegistry` からこれに替わる

## 確かめたこと
`tests/core/test_functionList.ts` は、次の三つの書き換えのそれぞれで落ちる：`isBuiltIn` → `hasFunction`、並べ替えを外す、`internal` を含める。
