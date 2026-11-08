# local-first-ledger

家族それぞれの端末でオフライン入力し、つながったらそろう家計簿を作りながら CRDT を学ぶ学習用リポジトリです。

要件の出典: [家族で共有するオフライン家計簿で学ぶCRDT](https://cursor.com/canvas/store-814ff134-ba94-4888-850e-06417b73a757/c3679f54-bdc0-41aa-a2c4-fba4d9ea0f38)

## いまの状態

- `docs/plan/v0.1.0.md` に **v0.1.0（自作 CRDT）の計画** がある
- TypeScript strict の最小 Node.js 開発・テスト環境がある
- **G-Counter / 後勝ちレジスタ / 収束テストは未実装**
- 型チェック・ビルド・スモークテスト成功は、CRDT 収束やブラウザオフライン同期の証拠ではない

## サポート対象ランタイム

公式のリリース状況とツール要件に合わせ、次をサポート対象とする。

| ツール | サポート対象 | 根拠 |
| --- | --- | --- |
| Node.js | `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` | [Node.js Releases](https://nodejs.org/en/about/previous-releases) で LTS 系を利用。Vitest 5 公式要件と一致 |
| pnpm | `>=10`（このリポジトリは `packageManager: pnpm@10.33.4`） | 単一のパッケージマネージャとして固定。lockfile は `pnpm-lock.yaml` のみ |
| TypeScript | `^7`（strict） | [TypeScript](https://www.typescriptlang.org/) 現行系。`engines.node >= 16.20.0` |
| Vitest | `^5` | [Vitest Getting Started](https://vitest.dev/guide/): Node `>=22.12.0`、Vite `>=6.4.0` |

再現可能な設定はこのリポジトリに含めます。セットアップはプロジェクト単位で完結する方法を主とします。

## 初回セットアップ

前提: Node.js 22.12 以上（推奨: 現行 LTS）。パッケージマネージャは pnpm 10 以上（`package.json` の `packageManager` は `pnpm@10.33.4`）。

```bash
# 推奨: 既に pnpm 10 以上がある場合（プロジェクト単位）
pnpm install --frozen-lockfile

# pnpm が PATH に無い場合の例（npx で指定版を一時利用。グローバル設定は変えない）
npx pnpm@10.33.4 install --frozen-lockfile
```

任意: Corepack でマシン全体に pnpm を載せる場合は `corepack enable` と `corepack prepare pnpm@10.33.4 --activate` を使う。これはグローバル設定の変更を伴うため、必須ではない。

## 検証手順

```bash
pnpm typecheck
pnpm build
pnpm test run
```

個別ファイル例（環境確認用スモークテスト）:

```bash
pnpm test run src/env-smoke.test.ts
```

`src/env-smoke.test.ts` は開発基盤の動作確認専用です。CRDT の収束テストではありません。

## 計画ドキュメント

- [docs/plan/v0.1.0.md](./docs/plan/v0.1.0.md) — 要件 7（自作 G-Counter / 後勝ちレジスタ）の計画と受け入れ条件
