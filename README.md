# local-first-ledger

家族の端末でオフライン入力し、つながったら状態がそろう家計簿を作りながら、CRDT を学ぶリポジトリです。

要件: [家族で共有するオフライン家計簿で学ぶCRDT](https://cursor.com/canvas/store-814ff134-ba94-4888-850e-06417b73a757/c3679f54-bdc0-41aa-a2c4-fba4d9ea0f38)

## いまできること / まだないもの

| 状態 | 内容 |
| --- | --- |
| ある | `docs/plan/`（v0.1.0〜v1.0.0 の計画と索引。完成定義つき） |
| ある | TypeScript strict の最小 Node.js 開発・テスト環境 |
| ある | mise による Node / pnpm / skills CLI / Python のバージョン固定 |
| ない | G-Counter / 後勝ちレジスタ / 収束テスト |
| ない | アプリ UI、ブラウザ永続化、中継同期、CRDT ライブラリ導入 |
| 注意 | 型チェック・ビルド・スモークテスト成功は、CRDT 収束やブラウザ同期の証拠ではない |

## 固定しているバージョン

| 対象 | 固定バージョン | 置き場 |
| --- | --- | --- |
| mise（前提ツール） | `2026.11.4` で検証 | マシンへ別途導入（下記） |
| Node.js | `22.23.4` | `mise.toml` / `mise.lock` |
| pnpm | `10.33.4` | `mise.toml` / `mise.lock` / `package.json#packageManager` |
| skills CLI（npm パッケージ名 `skills`） | `1.7.6`（[vercel-labs/skills](https://github.com/vercel-labs/skills)、Node `>=22.20.0`） | `mise.toml` の `npm:skills` |
| Python | `3.13.18` | `mise.toml` / `mise.lock`（yomiyasu 検査用。標準ライブラリのみ） |
| TypeScript / Vitest | lockfile どおり（`pnpm-lock.yaml`） | `package.json` |

`package.json` の `engines.node` は `^22.20.0 \|\| ^24.0.0 \|\| >=26.0.0` です。skills CLI の公式要件に合わせています。

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

3. 通ることを確認する

```bash
mise exec -- pnpm typecheck
mise exec -- pnpm build
mise exec -- pnpm test run
```

個別の環境確認用テストは次のとおりです。

```bash
mise exec -- pnpm test run src/env-smoke.test.ts
```

`src/env-smoke.test.ts` は開発基盤の確認だけです。CRDT の収束テストではありません。

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

| スキル | 導入先 | 取得元（固定） |
| --- | --- | --- |
| `i-have-adhd` | `.agents/skills/i-have-adhd` | `ayghri/i-have-adhd@v0.4.1`（commit `1ecea1993b7fce257ffbd686c070948b5e07eda6`） |
| `yomiyasu` | `.agents/skills/yomiyasu` | `nanaism/yomiyasu@v2.5.0`（commit `29d67ccb05e370b5958d72920a9cd1aa829dee80`） |

再導入の正規手順と固定リビジョンは `AGENTS.md` を見てください。`skills-lock.json` は記録補助であり、tag/commit の復元保証ではありません。

## 計画ドキュメント

完成（ざっくり）までのバージョン順序・要件対応・ライブラリ推奨比較は次を見てください。

- [docs/plan/README.md](./docs/plan/README.md): 索引と完成の定義
- [docs/plan/v0.1.0.md](./docs/plan/v0.1.0.md): 要件 7（自作 G-Counter / 後勝ちレジスタ）
- [docs/plan/v0.2.0.md](./docs/plan/v0.2.0.md): 要件 1（オフライン起動・永続化）
- [docs/plan/v0.3.0.md](./docs/plan/v0.3.0.md): 要件 2（中継差分同期）
- [docs/plan/v0.4.0.md](./docs/plan/v0.4.0.md): 要件 3・4・5・6（競合・予算・重複候補）
- [docs/plan/v1.0.0.md](./docs/plan/v1.0.0.md): 要件 8＋統合検証＋人手 1 週間
- [AGENTS.md](./AGENTS.md): ドキュメントを直すときの手順

ライブラリ（Automerge / Yjs / Loro）は未選定です。索引の推奨は仮置きです。
