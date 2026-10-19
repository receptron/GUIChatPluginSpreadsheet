# fix: 式の中の TRUE / FALSE を論理値として読む（#109、#91）

## 原因

- 式の中の裸の `TRUE` / `FALSE` は、どの道でも論理値として読まれていなかった。式の文字がそのまま返るか（`=TRUE+1`、`=FALSE&2`）、文字の `"TRUE"` になっていた（`=TRUE`、条件の `TRUE`）
- 論理値のセルを参照した式も、計算の道では読めていなかった（`=A1+1` が `"true+1"`）
- 論理値を文字にすると、小文字になっていた（`=CONCATENATE(A1,1)` が `"true1"`）

## 直したこと

- `src/engine/logicalLiterals.ts`（純粋な関数）
  - `logicalLiteralsAsBooleans`：文字列の外の裸の `TRUE` / `FALSE`（大文字小文字は問わない）を、論理値のセルが式に入るときと同じ `true` / `false` に書き換える。呼び出し（`TRUE()`）、シート名（`TRUE!A1`、`'TRUE'!A1`）、長い名前、参照、文字列の中は書き換えない
  - `loneBoolean`：式がそれだけ（括弧つきも）なら、その論理値
  - `booleansAsNumbers`：計算では TRUE を 1、FALSE を 0 として読む（文字を含む式は除く）
- `evaluator.ts`：式を評価する前に書き換える。計算の手前で、式が論理値だけならそれを返す。そうでなければ、数として計算する
- `registry.ts` の `toString`：論理値を `TRUE` / `FALSE` と書く（Excel と同じ）

## 対象外

- `=SUM(TRUE,1)`：集計の関数に直接書いた値の扱いは #116

## テスト（`tests/engine/test_logicalLiterals.ts`）

- 書き換えの例と、書き換えないもの
- #91・#109 の表、計算、文字にしたとき、文字の "TRUE"
- 生成した式で、TRUE と書いた式と、true のセルを参照した式が、同じ答えになる（種を表示する。`LOGICAL_SEED`）
- 実装をわざと壊すと、テストが落ちる
