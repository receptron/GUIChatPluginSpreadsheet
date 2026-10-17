# prettier で整形をそろえる（#44）

## 方針
- 設定は mulmoclaude に合わせて `printWidth: 160` のみ
- `format`（書き込み）と `format:check`（確認のみ）を用意し、CI は Linux だけで `format:check`
  - Windows は checkout で CRLF になり、prettier が未整形と判定するため
- `.prettierignore` に `.scoria/` と `scoria.config.json`（scoria の `JSON.stringify` 出力と prettier の整形が毎回書き換え合うため）、`dist/` と `coverage/`
- 既存コードは一括整形

## 確認したこと
- eslint の警告はルールごとの件数が整形前後で同じ。整形系ルールとの衝突は無いので `eslint-config-prettier` は入れない
- 整形した JSON はパース結果が整形前と一致
- CI と同じ typecheck / lint / build / 各テストが通る
