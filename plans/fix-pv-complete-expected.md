# fix: run-pv-analysis-complete-test の期待値を直す (#57)

## 原因

期待値は、表示上の月利 `0.42%`（0.0042）で計算されていた。エンジンは B4 の値 `0.05/12` を丸めずに使う（Excel と同じ）ので、B5 と C9:C20 がずれる。0.0042 で計算し直すと、古い期待値と一致する。

## 直し方

- `tests/engine/test-utils.ts` に `expectedPvAnalysisMonth(month)` を足す。`expectedPvAnalysisTotal()` と同じ式で、エンジンを使わずに計算する
- テストの B5 と C9:C20 の期待値を、この 2 つの関数から求める
- `test:scripts` にこのテストを入れて、CI で走らせる

## 確かめたこと

- 直したテストは通る
- B4 を `=ROUND(B3/12,4)` に変えると落ちる（丸めた月利の値を、ずれとして見つけられる）
