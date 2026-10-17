# scoria で coverage も測る（#45）

## 方針
- coverage は `c8` で取る。`yarn test:coverage` = `c8 yarn run test:suites`
  - テストの大半は vitest ではなく `tsx`（`node:test` とスクリプト）で走る。`@vitest/coverage-v8` では vitest の 2 ファイル分しか測れず、実態より大幅に低く出た
  - `c8` は子プロセスまで V8 の coverage を集めるので、vitest と tsx の両方が入る
- `.c8rc.json`：`all: true` でテストが読み込まないファイル（`src/lang`、`src/vue` など）も母数に入れる。`include: src/**`
- `test:suites` は CI で走るテストスクリプトをまとめたもの
- scoria ワークフローで scoria の前に `test:coverage` を走らせ、`coverage/lcov.info` を読ませる
- baseline を取り直す

## 注意
- `.vue` は c8 では変換されないので、行数は概算
- 取り直した baseline では循環依存の検査も結果を出しており、architecture の点も変わっている（前回は検査が結果を出せず、その部分が測れていなかった）
