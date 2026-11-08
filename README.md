# local-first-ledger

家族の端末でオフライン入力し、つながったら状態がそろう家計簿を作りながら、CRDT を学ぶリポジトリです。

要件: [家族で共有するオフライン家計簿で学ぶCRDT](https://cursor.com/canvas/store-814ff134-ba94-4888-850e-06417b73a757/c3679f54-bdc0-41aa-a2c4-fba4d9ea0f38)

## いまできること / まだないもの

| 状態 | 内容 |
| --- | --- |
| ある | `docs/plan/v0.1.0.md`（v0.1.0 の計画） |
| ある | TypeScript strict の最小 Node.js 開発・テスト環境 |
| ある | mise による Node / pnpm / skills CLI の版固定 |
| ない | G-Counter / 後勝ちレジスタ / 収束テスト |
| 注意 | 型チェック・ビルド・スモークテスト成功は、CRDT 収束やブラウザ同期の証拠ではない |

## 固定している版

| 対象 | 固定版 | 置き場 |
| --- | --- | --- |
| mise（前提ツール） | `2026.11.4` で検証 | マシンへ別途導入（下記） |
| Node.js | `22.23.4` | `mise.toml` / `mise.lock` |
| pnpm | `10.33.4` | `mise.toml` / `mise.lock` / `package.json#packageManager` |
| skills CLI（npm パッケージ名 `skills`） | `1.7.6`（[vercel-labs/skills](https://github.com/vercel-labs/skills)、Node `>=22.20.0`） | `mise.toml` の `npm:skills` |
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

個別の環境確認用テスト:

```bash
mise exec -- pnpm test run src/env-smoke.test.ts
```

`src/env-smoke.test.ts` は開発基盤の確認だけです。CRDT の収束テストではありません。

### mise を使わない場合（互換手順）

既に Node `22.20+` と pnpm `10.33.4` があるなら、次でも同じ依存を入れられます。

```bash
pnpm install --frozen-lockfile
```

pnpm が PATH に無いときの一時利用（グローバル設定は変えない）:

```bash
npx pnpm@10.33.4 install --frozen-lockfile
```

Corepack の `enable` / `prepare --activate` はマシン全体の設定を変えます。必須ではありません。

## ドキュメント用スキル

読みやすさの改善には、次をプロジェクトスコープで入れています。

| スキル | 導入先 | 取得元（固定） |
| --- | --- | --- |
| `i-have-adhd` | `.agents/skills/i-have-adhd` | `ayghri/i-have-adhd@v0.4.1`（commit `1ecea1993b7fce257ffbd686c070948b5e07eda6`） |
| `yomiyasu` | `.agents/skills/yomiyasu` | `nanaism/yomiyasu@v2.5.0`（commit `29d67ccb05e370b5958d72920a9cd1aa829dee80`） |

再導入の正規手順と固定リビジョンは `AGENTS.md` を見てください。`skills-lock.json` は記録補助であり、tag/commit の復元保証ではありません。

## 計画ドキュメント

- [docs/plan/v0.1.0.md](./docs/plan/v0.1.0.md) — 要件 7（自作 G-Counter / 後勝ちレジスタ）の計画と受け入れ条件
- [AGENTS.md](./AGENTS.md) — ドキュメントを直すときの手順
