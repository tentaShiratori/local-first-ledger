# local-first-ledger

家族の端末でオフライン入力し、つながったら状態がそろう家計簿を作りながら、CRDT を学ぶリポジトリです。

要件: [家族で共有するオフライン家計簿で学ぶCRDT](https://cursor.com/canvas/store-814ff134-ba94-4888-850e-06417b73a757/c3679f54-bdc0-41aa-a2c4-fba4d9ea0f38)

## いまできること / まだないもの

| 状態 | 内容                                                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| ある | `docs/plan/`（v0.1.0〜v1.0.0 の計画と索引。完成定義つき）                                                                   |
| ある | TypeScript strict の開発・テスト環境と Vite SPA（家計簿 UI）                                                                |
| ある | mise による Node / pnpm / skills CLI / Python のバージョン固定                                                              |
| ある | 品質チェック（typecheck / Vite+ lint・format・test / fallow / カバレッジ80%）                                               |
| ある | 自作 G-Counter / 後勝ちレジスタと、3 レプリカの収束テスト（固定例・代数・seed 付きランダム）                                |
| ある | Yjs 明細ドキュメント、`y-indexeddb` 永続化、端末 ID、Service Worker によるオフライン起動                                    |
| ある | 同一プロファイル複数タブの単一書き込み＋警告                                                                                |
| ある | 中継サーバー経由の差分同期（opaque 更新ログ。サーバーは yjs を解釈しない）                                                  |
| ある | フィールド単位編集、編集優先の削除、予算の足し引き、重複候補表示                                                            |
| ある | E2E（npm `e2e` + `@e2e-dev/web`。locator / assertion のみ。モデル不要）                                                     |
| ない | 明細履歴 UI と最終統合シナリオ（v1.0.0）                                                                                    |
| 注意 | 型チェック・ビルド成功だけでは収束の証拠ではない。v0.4.0 は conflict / budget / duplicates と `pnpm verify:conflict-fields` |
| 注意 | 中継サーバーに認証はない。一般公開しない。ローカルまたは閉じた検証環境だけで使う                                            |

## 固定しているバージョン

| 対象                                    | 固定バージョン                                                                           | 置き場                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| mise（前提ツール）                      | `2026.11.4` で検証                                                                       | マシンへ別途導入（下記）                                         |
| Node.js                                 | `22.23.4`                                                                                | `mise.toml` / `mise.lock`                                        |
| pnpm                                    | `10.33.4`                                                                                | `mise.toml` / `mise.lock` / `package.json#packageManager`        |
| skills CLI（npm パッケージ名 `skills`） | `1.7.6`（[vercel-labs/skills](https://github.com/vercel-labs/skills)、Node `>=22.20.0`） | `mise.toml` の `npm:skills`                                      |
| Python                                  | `3.13.18`                                                                                | `mise.toml` / `mise.lock`（yomiyasu 検査用。標準ライブラリのみ） |
| TypeScript                              | lockfile どおり（`pnpm-lock.yaml`）                                                      | `package.json`                                                   |
| Vite+（lint / format / test / build）   | `1.5.0`（catalog 固定。同梱 Oxlint / Oxfmt / Vitest 5.1.0）                              | `pnpm-workspace.yaml` / `package.json`                           |
| fallow（dead code）                     | `3.41.0`（完全固定）                                                                     | `package.json` / `pnpm-lock.yaml`                                |
| `@vitest/coverage-v8`                   | `5.1.0`（catalog 固定）                                                                  | `pnpm-workspace.yaml` / `package.json`                           |
| yjs / y-indexeddb                       | lockfile どおり                                                                          | `package.json`                                                   |
| ws（中継サーバー）                      | lockfile どおり                                                                          | `package.json`                                                   |
| e2e / `@e2e-dev/web`                    | lockfile どおり                                                                          | `package.json`                                                   |

`package.json` の `engines.node` は `^22.20.0 \|\| ^24.0.0 \|\| >=26.0.0` です。skills CLI の公式要件に合わせています。

品質ツールの選定: Vite+ は VoidZero の統合ツールチェーンで、lint（Oxlint）と format（Oxfmt）と test（Vitest）を同じ `vp` CLI で扱います。dead code 検出は fallow（`fallow dead-code`）を使います。

## 初回セットアップ

前提: このリポジトリ外で mise を入れる（検証済み: `2026.11.4`）。導入手順は [mise Getting Started](https://mise.jdx.dev/getting-started.html)。シェルへの常時 activate は不要です。`mise exec` / `mise run` だけで足ります。

1. リポジトリ直下でツールを入れる

```bash
mise trust
mise install
mise ls --current
```

2. 依存関係を lockfile から入れる

```bash
mise exec -- pnpm install --frozen-lockfile
```

3. 通ることを確認する（まとめて実行）

```bash
mise exec -- pnpm check
```

個別コマンドは次のとおりです。

```bash
mise exec -- pnpm typecheck
mise exec -- pnpm lint
mise exec -- pnpm fmt
mise exec -- pnpm deadcode
mise exec -- pnpm test:coverage
mise exec -- pnpm build
```

アプリ UI の開発・プレビュー:

```bash
mise exec -- pnpm dev
mise exec -- pnpm build:app
mise exec -- pnpm preview
```

### 中継サーバー（v0.3.0）

1. 中継を起動する（既定 `ws://127.0.0.1:8787`。保管は `.relay-data/`）

```bash
mise exec -- pnpm relay
```

2. アプリを開き、共有ドキュメントと中継 URL を指定する（省略時は `family-demo` と `ws://127.0.0.1:8787`）

```text
http://127.0.0.1:5173/?doc=family-demo&relay=ws://127.0.0.1:8787
```

オプション: `--host` / `--port` / `--data-dir`、または環境変数 `RELAY_HOST` / `RELAY_PORT` / `RELAY_DATA_DIR`。

認証はない。インターネットへ一般公開しない。

書式を直すときは `mise exec -- pnpm fmt:write` です。CRDT 収束テスト・台帳・同期・環境確認用テストは次のとおりです。

```bash
mise exec -- pnpm test run src/g-counter.test.ts
mise exec -- pnpm test run src/lww-register.test.ts
mise exec -- pnpm test run src/ledger
mise exec -- pnpm test run src/relay
mise exec -- pnpm test run src/env-smoke.test.ts
```

ブラウザ受け入れ（初回は Chromium 導入が必要）:

```bash
mise exec -- pnpm exec e2e-web install chromium --with-deps
mise exec -- pnpm e2e
mise exec -- pnpm verify:offline-tabs
mise exec -- pnpm verify:relay-sync
mise exec -- pnpm verify:conflict-fields
```

`pnpm e2e` は追加・リロード復元・端末 ID 安定を見る。`pnpm verify:offline-tabs` はオフライン起動と複数タブを確認する。`pnpm verify:relay-sync` はオンライン同期とオフライン中追加→復帰後の一致を確認する。`pnpm verify:conflict-fields` はオフライン中の別フィールド同時編集が復帰後に両方残ることを確認する。

`src/env-smoke.test.ts` と品質チェック単体の成功は開発基盤の確認です。CRDT の収束根拠は G-Counter / LWW と v0.4.0 の conflict / budget テストです。

### Python（yomiyasu 検査）

`mise install` で Python `3.13.18` とプロジェクトの `.venv` が用意されます（`.venv/` は git 管理外）。yomiyasu 付属スクリプトは標準ライブラリだけで動くため、追加の pip パッケージは不要です。

```bash
mise exec -- python --version
mise exec -- python -c 'import sys; print(sys.executable)'
```

文書検査の手順は `AGENTS.md` を見てください。

### mise を使わない場合（互換手順）

既に Node `22.20+` と pnpm `10.33.4` があるなら、次でも同じ依存を入れられます。

```bash
pnpm install --frozen-lockfile
```

pnpm が PATH に無いときの一時利用は、グローバル設定を変えずに次を使います。

```bash
npx pnpm@10.33.4 install --frozen-lockfile
```

Corepack の `enable` / `prepare --activate` はマシン全体の設定を変えます。必須ではありません。

## ドキュメント用スキル

読みやすさの改善には次をプロジェクトスコープで入れています。

| スキル        | 導入先                       | 取得元（固定）                                                                   |
| ------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `i-have-adhd` | `.agents/skills/i-have-adhd` | `ayghri/i-have-adhd@v0.4.1`（commit `1ecea1993b7fce257ffbd686c070948b5e07eda6`） |
| `yomiyasu`    | `.agents/skills/yomiyasu`    | `nanaism/yomiyasu@v2.5.0`（commit `29d67ccb05e370b5958d72920a9cd1aa829dee80`）   |

再導入の正規手順と固定リビジョンは `AGENTS.md` を見てください。`skills-lock.json` は記録補助であり、tag/commit の復元保証ではありません。

## 計画ドキュメント

完成（ざっくり）までのバージョン順序・要件対応・ライブラリ選定は次を見てください。

- [docs/plan/README.md](./docs/plan/README.md): 索引と完成の定義
- [docs/plan/v0.1.0.md](./docs/plan/v0.1.0.md): 要件 7（自作 G-Counter / 後勝ちレジスタ）※実装済み
- [docs/plan/v0.2.0.md](./docs/plan/v0.2.0.md): 要件 1（オフライン起動・永続化）※実装済み
- [docs/plan/v0.3.0.md](./docs/plan/v0.3.0.md): 要件 2（中継差分同期）※実装済み
- [docs/plan/v0.4.0.md](./docs/plan/v0.4.0.md): 要件 3・4・5・6（競合・予算・重複候補）※実装済み
- [docs/plan/v1.0.0.md](./docs/plan/v1.0.0.md): 要件 8＋統合検証＋人手 1 週間
- [AGENTS.md](./AGENTS.md): ドキュメントを直すときの手順

ライブラリは **Yjs を採用**しています（人気で選定。旧 Automerge 推奨は上書き。詳細は索引）。
