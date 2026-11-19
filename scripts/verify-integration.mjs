/**
 * v1.0.0 統合シナリオ:
 * 2 ブラウザをオフラインにし、それぞれ 5 件入力し、同じ明細を両方で編集し、
 * オンライン復帰後に一覧と合計が画面と内部状態の両方で一致することを確認する。
 */
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distApp = path.join(root, "dist-app");

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
  [".json", "application/json"],
]);

function contentType(filePath) {
  return mime.get(path.extname(filePath)) ?? "application/octet-stream";
}

async function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith("/")) rel += "index.html";
      if (rel === "/") rel = "/index.html";
      const filePath = path.join(distApp, rel);
      if (!filePath.startsWith(distApp)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(body);
    } catch {
      const body = await readFile(path.join(distApp, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(body);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("failed to bind static server");
  }
  return { server, port: address.port };
}

async function startRelayFromDist() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "verify-integration-"));
  const mod = await import(pathToFileURL(path.join(root, "dist/relay/server.js")).href);
  return mod.startRelayServer({ host: "127.0.0.1", port: 0, dataDir });
}

async function waitForSyncConnected(page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="sync-status"]');
      return (
        el !== null &&
        (el.dataset.status === "connected" || el.textContent?.startsWith("connected"))
      );
    },
    null,
    { timeout: 20_000 },
  );
}

async function fillEntry(page, { amount, category, memo, enteredBy }) {
  await page.locator('[data-testid="field-amount"]').fill(String(amount));
  await page.locator('[data-testid="field-category"]').fill(category);
  await page.locator('[data-testid="field-memo"]').fill(memo);
  await page.locator('[data-testid="field-entered-by"]').selectOption(enteredBy);
  await page.locator('[data-testid="submit-entry"]').click();
}

async function uiSnapshot(page) {
  const memos = await page.locator('[data-testid="entry-memo"]').allTextContents();
  const amounts = await page.locator('[data-testid="entry-amount"]').allTextContents();
  const total = await page.locator('[data-testid="total-amount"]').innerText();
  return {
    memos: memos.slice().sort(),
    amounts: amounts.slice().sort(),
    total: Number(total),
  };
}

async function internalSnapshot(page) {
  return page.evaluate(() => {
    const fn = window.__localFirstLedgerSnapshot;
    if (typeof fn !== "function") {
      throw new Error("__localFirstLedgerSnapshot missing");
    }
    const snap = fn();
    return {
      totalAmount: snap.totalAmount,
      entries: snap.entries
        .map((entry) => ({
          id: entry.id,
          amount: entry.amount,
          memo: entry.memo,
          category: entry.category,
          enteredBy: entry.enteredBy,
        }))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      historyEventCount: snap.historyEventCount,
    };
  });
}

function assertEqual(label, left, right) {
  const a = JSON.stringify(left);
  const b = JSON.stringify(right);
  if (a !== b) {
    throw new Error(`${label} mismatch:\nA=${a}\nB=${b}`);
  }
}

async function main() {
  const { server, port } = await startStaticServer();
  const relay = await startRelayFromDist();
  const browser = await chromium.launch({ headless: true });
  const base = `http://127.0.0.1:${port}/?doc=family-integration&relay=${encodeURIComponent(relay.url)}`;
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto(base, { waitUntil: "networkidle" });
    await pageB.goto(base, { waitUntil: "networkidle" });
    await pageA.waitForSelector('[data-testid="entry-form"]');
    await pageB.waitForSelector('[data-testid="entry-form"]');
    await waitForSyncConnected(pageA);
    await waitForSyncConnected(pageB);

    // 共有の種明細を 1 件だけオンラインで作り、あとで両方編集する
    await fillEntry(pageA, {
      amount: 680,
      category: "食費",
      memo: "共有コンビニ弁当",
      enteredBy: "たろう",
    });
    await pageB.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-testid="entry-memo"]')].some(
          (node) => node.textContent === "共有コンビニ弁当",
        ),
      null,
      { timeout: 15_000 },
    );

    await contextA.setOffline(true);
    await contextB.setOffline(true);

    const aExtras = [
      { amount: 120, category: "食費", memo: "たろうおやつ1", enteredBy: "たろう" },
      { amount: 220, category: "食費", memo: "たろうおやつ2", enteredBy: "たろう" },
      { amount: 320, category: "交通", memo: "たろうバス", enteredBy: "たろう" },
      { amount: 420, category: "日用品", memo: "たろうティッシュ", enteredBy: "たろう" },
      { amount: 520, category: "食費", memo: "たろう夕食", enteredBy: "たろう" },
    ];
    const bExtras = [
      { amount: 130, category: "食費", memo: "はなこおやつ1", enteredBy: "はなこ" },
      { amount: 230, category: "食費", memo: "はなこおやつ2", enteredBy: "はなこ" },
      { amount: 330, category: "交通", memo: "はなこ電車", enteredBy: "はなこ" },
      { amount: 430, category: "日用品", memo: "はなこ洗剤", enteredBy: "はなこ" },
      { amount: 530, category: "食費", memo: "はなこ夕食", enteredBy: "はなこ" },
    ];

    for (const entry of aExtras) {
      await fillEntry(pageA, entry);
    }
    for (const entry of bExtras) {
      await fillEntry(pageB, entry);
    }

    await pageA.waitForFunction(
      () => document.querySelectorAll('[data-testid="entry-item"]').length >= 6,
    );
    await pageB.waitForFunction(
      () => document.querySelectorAll('[data-testid="entry-item"]').length >= 6,
    );

    // 同じ共有明細を両方で編集（別フィールド）
    pageA.once("dialog", async (dialog) => {
      await dialog.accept("はなこ向けメモ更新");
    });
    await pageA
      .locator('[data-testid="entry-item"]')
      .filter({ hasText: "共有コンビニ弁当" })
      .locator('[data-testid="edit-memo"]')
      .click();
    await pageA.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="entry-memo"]')].some(
        (node) => node.textContent === "はなこ向けメモ更新",
      ),
    );

    pageB.once("dialog", async (dialog) => {
      await dialog.accept("710");
    });
    await pageB
      .locator('[data-testid="entry-item"]')
      .filter({ hasText: "共有コンビニ弁当" })
      .locator('[data-testid="edit-amount"]')
      .click();
    await pageB.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="entry-amount"]')].some(
        (node) => node.textContent === "710円",
      ),
    );

    await contextA.setOffline(false);
    await contextB.setOffline(false);
    await waitForSyncConnected(pageA);
    await waitForSyncConnected(pageB);

    await pageA.waitForFunction(
      () => document.querySelectorAll('[data-testid="entry-item"]').length === 11,
      null,
      { timeout: 30_000 },
    );
    await pageB.waitForFunction(
      () => document.querySelectorAll('[data-testid="entry-item"]').length === 11,
      null,
      { timeout: 30_000 },
    );
    await pageA.waitForFunction(
      () => {
        const memos = [...document.querySelectorAll('[data-testid="entry-memo"]')].map(
          (node) => node.textContent,
        );
        const amounts = [...document.querySelectorAll('[data-testid="entry-amount"]')].map(
          (node) => node.textContent,
        );
        return memos.includes("はなこ向けメモ更新") && amounts.includes("710円");
      },
      null,
      { timeout: 20_000 },
    );
    await pageB.waitForFunction(
      () => {
        const memos = [...document.querySelectorAll('[data-testid="entry-memo"]')].map(
          (node) => node.textContent,
        );
        const amounts = [...document.querySelectorAll('[data-testid="entry-amount"]')].map(
          (node) => node.textContent,
        );
        return memos.includes("はなこ向けメモ更新") && amounts.includes("710円");
      },
      null,
      { timeout: 20_000 },
    );

    const uiA = await uiSnapshot(pageA);
    const uiB = await uiSnapshot(pageB);
    assertEqual("UI list/total", uiA, uiB);

    const internalA = await internalSnapshot(pageA);
    const internalB = await internalSnapshot(pageB);
    assertEqual("internal entries/total", internalA, internalB);

    if (internalA.totalAmount !== uiA.total) {
      throw new Error(`UI total ${uiA.total} != internal ${internalA.totalAmount}`);
    }
    if (internalA.entries.length !== 11) {
      throw new Error(`expected 11 entries, got ${internalA.entries.length}`);
    }
    if (internalA.historyEventCount < 13) {
      // 1 create shared + 10 offline creates + 2 concurrent edits = 13 以上
      throw new Error(`expected history events >= 13, got ${internalA.historyEventCount}`);
    }

    const expectedTotal =
      710 +
      aExtras.reduce((sum, entry) => sum + entry.amount, 0) +
      bExtras.reduce((sum, entry) => sum + entry.amount, 0);
    if (internalA.totalAmount !== expectedTotal) {
      throw new Error(`total ${internalA.totalAmount} != expected ${expectedTotal}`);
    }

    console.log(
      JSON.stringify({
        ok: true,
        scenario: "2browsers-offline-5each-concurrent-edit",
        entryCount: internalA.entries.length,
        totalAmount: internalA.totalAmount,
        historyEventCount: internalA.historyEventCount,
        uiMatchesInternal: true,
        browsersMatch: true,
      }),
    );
  } finally {
    await browser.close();
    await relay.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
