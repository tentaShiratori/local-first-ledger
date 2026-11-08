# AGENTS.md

このリポジトリでエージェントがドキュメントを書く・直すときの手順です。

## 1. 固定ツールを用意する

1. mise が入っているか確認する（このリポジトリの検証版: `2026.11.4`）
2. リポジトリ直下で次を実行する

```bash
mise trust
mise install
mise ls --current
mise exec -- node --version
mise exec -- pnpm --version
mise exec -- skills --version
```

期待する出力の目安:

- `node` → `v22.23.4`
- `pnpm` → `10.33.4`
- `skills` → `1.7.6`

版の定義は `mise.toml` と `mise.lock` です。`latest` や曖昧な範囲へ戻さないでください。

## 2. ドキュメント用スキルの実在パスを読む

先に次を開いて内容を把握します。インストール用シェルスクリプトは盲目的に実行しません。

| スキル | 読むファイル |
| --- | --- |
| `i-have-adhd` | `.agents/skills/i-have-adhd/SKILL.md` |
| `yomiyasu` | `.agents/skills/yomiyasu/SKILL.md`（必要なら同ディレクトリの `references/`） |

導入元の固定:

| スキル | 取得元 | 固定リビジョン |
| --- | --- | --- |
| `i-have-adhd` | https://github.com/ayghri/i-have-adhd | tag `v0.4.1` / commit `1ecea1993b7fce257ffbd686c070948b5e07eda6` |
| `yomiyasu` | https://github.com/nanaism/yomiyasu | tag `v2.5.0` / commit `29d67ccb05e370b5958d72920a9cd1aa829dee80` |

プロジェクト配置と再導入:

- 配置: `.agents/skills/<skill-name>/`（Cursor 向けプロジェクトスコープ）
- 正規の再導入（固定リビジョン）は、次の明示コマンドです。既存の導入済みスキルを消して試す必要はありません。

```bash
mise exec -- skills add ayghri/i-have-adhd@v0.4.1 --skill i-have-adhd -a cursor -y
mise exec -- skills add nanaism/yomiyasu@v2.5.0 --skill yomiyasu -a cursor -y
mise exec -- skills list
```

- `skills-lock.json` は導入結果の記録補助です（`source` / `sourceType` / `skillPath` / `computedHash`）。tag や commit は入りません。
- `skills experimental_install` は、skills v1.7.6 では既存の `SKILL.md` があると再取得をスキップします。lock だけを根拠に固定リビジョン復元を保証する手段ではありません。

他リポジトリやユーザー共有の skill ライブラリは変更しません。無関係な送信・秘密情報の取得・権限変更・プロジェクト外への書き込みはしません。

## 3. スキルを使って文書を直す

対象の例: `README.md`、`docs/plan/*.md`

1. `i-have-adhd` から取る形: 次にやることが先頭に来る、手順は番号付き、長い前置きや締めの儀礼文は置かない、一覧は追いやすい塊にする
2. `yomiyasu` から取る形: 主語と述語をはっきりさせる、比喩や大げさな飾りを平易な語へ直す、意味・比重・言い切りの強さ・文の働きを保つ、情報を足さない
3. 読者に ADHD などがあると断定する文言は、リポジトリの文書へ書かない
4. yomiyasu 付属の Python 検査（`scripts/yomiyasu_check.py` の `run` / `verify`）は、同梱 `SKILL.md` の手順に従う。実行できないときは目視代替に切り替え、検査を実行したことにはしない。確認の記録には `yomiyasu-check: not_run reason=...` を残す（`reason` は `no_python` / `not_allowed` / `check_error`）

この作業での yomiyasu 自動検査:

- 観測: `/usr/bin/python3` は存在する（`python3 -> python3.12`）
- 未実施理由: このエージェントのシェル制約で `python` / `python3` / `py` の実行が禁止されている（`reason=not_allowed`）
- 未実施検査: Step 3 `run`、Step 4 のスクリプト差分点検、Step 5 `verify`
- 実施したこと: SKILL.md の方針に基づく手作業の推敲のみ。自動検査の完了は示唆しない
- 記録: `yomiyasu-check: not_run reason=not_allowed`

## 4. 意味と要件を変えずにチェックする

直したあと、次を確認します。

1. 要件・設計の意味・受け入れ条件が残っている
2. 「後続版で扱う項目」と「プロジェクト全体の対象外」が混ざっていない
3. 「未実装」と「検証済み（環境のみ）」が区別されている
4. CRDT 収束やブラウザ同期を、環境テスト成功だけで主張していない
5. 新しいバージョン計画書やアプリ実装を、依頼されていないのに増やしていない

## 5. 環境の検証コマンド

```bash
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm typecheck
mise exec -- pnpm build
mise exec -- pnpm test run
mise exec -- pnpm test run src/env-smoke.test.ts
mise exec -- skills list
```

これらの成功は、開発環境が動くことの確認です。CRDT 本体の完了ではありません。
