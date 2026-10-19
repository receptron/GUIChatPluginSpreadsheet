# 丸めを 15 桁の精度で行い、POWER の範囲外を誤りにする（#105）

## 見つけ方

整数の仮数と小数の桁数から小数を作り、`ROUND` / `ROUNDUP` / `ROUNDDOWN` を、BigInt で正確に丸めた結果と比べた。#105 の表の食い違いが出た。

## 直したこと（`src/engine/math-ops.ts`）

- 丸める前に、桁を移した値を 15 桁の精度で読み直す（`atExcelPrecision`）。Excel が 15 桁で計算するのに合わせた。
- `FLOOR` / `CEILING` は、割った商と結果を同じように読み直す。
- `TRUNC` は `ROUNDDOWN` と同じ関数を使う（`mathematical.ts`）。
- `POWER`：0 の負の累乗は `#DIV/0!`、`0^0` は `#NUM!`、有限でない結果は `#NUM!`。

## テスト

`tests/engine/test_roundingPrecision.ts`：#105 の各場合と、生成した小数を正確な整数の計算と比べるテスト（`ROUNDING_SEED=<seed>` で再現）。直す前のコードでは、どれも落ちる。

## 直していないもの

- 負の数を正の基準で `FLOOR` / `CEILING` するとき（#2389 で `#NUM!` と決めたもの）。本物の Excel で確かめられていない。
- `^` の演算子での `0^0`（`evaluator.ts` 側）。
