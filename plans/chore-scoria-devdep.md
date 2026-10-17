# scoria を開発依存に入れる（#48）

## 方針
- `scoria` を devDependencies に入れ、`yarn quality`（= `scoria`）で走らせる
- scoria ワークフローは `npx -y scoria@0.3.0` をやめて `yarn run quality --sarif scoria.sarif`
- 版は lockfile で固定。0.x の `^` は minor を追わないので、新しい版へは `yarn upgrade --latest` / Dependabot で上げる

## 受け入れたこと
- scoria → jscpd → fast-glob → micromatch → braces 3.0.3 に High の警告（GHSA-vfj7-8cjw-p6xm）。braces の修正版が未公開なので今は消せない。開発依存なので利用者には届かない
- scoria 自身もこの警告を security の点として拾う（main と比べて違う指標は `audit.high` だけ）
