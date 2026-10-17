# scoria でコード品質を計測する（#42）

## 方針
- `scoria init` で検出結果（profile: library / stacks: vue, ts）を `scoria.config.json` に固定する
- `scoria baseline` で `.scoria/baseline.json` を記録し、以後の実行は差分を報告する
- CI は `.github/workflows/scoria.yml`。`conect-guild` の構成に合わせる
  - `npx -y scoria@0.3.0` で版を固定し、`package.json` には入れない（scoria の依存ツリーの audit 警告を持ち込まない）
  - `mode: report` なのでビルドは落とさない
  - 計測ジョブは読み取り権限のみ。SARIF のアップロードは `security-events: write` を持つ別ジョブで、プロジェクトのコードは走らせない

## 今回やらないこと
- coverage の計測（`@vitest/coverage-v8` の追加が必要）
- 他プラグインへの展開

## 既知の点
- `.vue` の import に `TS2307` が出る。型検査は `vue-tsc` で通るので scoria 側の誤検知の可能性が高い
