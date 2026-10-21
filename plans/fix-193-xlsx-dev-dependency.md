# xlsx を devDependencies に移す（#193）

## 問題
- `xlsx` を `dependencies` に SheetJS の配布サイトの URL で書いていた。npm 12 は初期設定（`allow-remote=none`）で URL からの取得を拒むため、このパッケージに依存するものはすべてインストールに失敗する（`mulmoclaude@2.8.0` で確認）

## 方針
- `vite.config.ts` の `external` に `xlsx` は入っていないので、SheetJS はビルド時に `dist/vue.js` / `dist/vue.cjs` に取り込まれている。使う側に `xlsx` は要らない
- `xlsx` を `devDependencies` に移す（ビルドには要る）。URL の指定はそのまま
- `tests/core/test_packageManifest.ts`：`dependencies` / `peerDependencies` / `optionalDependencies` に、URL・git・`file:`・`owner/repo` 形式の指定があれば落ちる

## 公開
- 5.0.1 を `main` から出す
- `mulmoclaude@2.8.0` は `^4.3.0` で指定しているので、4.3.0 のタグから 4.x の枝を切って同じ変更で 4.3.1 を出す（`latest` を動かさないよう `--tag` 付きで公開）

## 確かめたこと
- 変更前後の `package.json` でビルドした `dist/` が完全に一致する
- `npm pack` した物を npm 12.0.2・空の設定でインストールでき、`xlsx` は入らず、`.`・`./vue`・`./core` が読み込める（`./vue` は `require` でも）
- テストは変更前の `package.json` で落ちる
