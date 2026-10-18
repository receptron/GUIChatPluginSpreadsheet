# tests のコードスキャン警告を直し、孤立したテストを CI で走らせる（#56）

## 直したもの
- `knip.json`：テストの入り口（`tests/**/test_*.ts`、`tests/engine/run-*.ts`、`tests/engine/test-functions.ts`）を書く。`tsx --test` の glob で走るテストを knip が知らず、テストと、テストからしか使われない src の export を「使われていない」と数えていた
- 孤立していた `tests/engine/run-*.ts` のうち通る 4 本（formatter / lowercase / pv-analysis / recalc）を `test:scripts` にまとめ、`test:suites`（coverage）と CI で走らせる
- `run-parser-tests.ts` を削除：エンジン入れ替え（52a32fb）で `parser.ts` から外された `parseCellRef` / `parseRangeRef` / `cellRefToA1` のテストで、読み込みの時点で落ちていた。残る列変換は `parser.test.ts` と `test_parser.ts` が見ている
- テスト内の補助関数で外側の変数を使わないものをファイル最上位へ（consistent-function-scoping）。最上位に出て意味が曖昧になる `run` は `calculateWithBlanks` に
- `run-all-fixtures.ts`：`__dirname` / `__filename` を `import.meta.dirname` に、リテラル同士の連結を 1 つのテンプレートに

## 確かめたこと
- `tsx --test` のテスト件数と結果が main と同じ
- CI と同じ typecheck / lint / build / 各テストが通る

## 直さないもの
- `test_sheetSession.ts` の `resolve` / `reject`：Promise の生成で即座に上書きされる仮の初期値
- `test_formulaRefs.ts` の `.sort()`：`slice()` のコピーに対して呼んでいる
- `__ifsProbe` などの no-underscore-dangle：数式が JS として実行されないことを確かめるための意図的なグローバル名
- approx-constant：`3.14159` は円周率ではなく丸めの入力値
- `run-*.ts` 同士の重複：決まった書き出し部分
- `run-pv-analysis-complete-test.ts`：期待値と結果がずれている（別 issue）。CI にはまだ入れない
