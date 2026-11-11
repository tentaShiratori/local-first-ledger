/**
 * 2 つの別ブラウザコンテキスト + ローカル中継で、オンライン同期と
 * オフライン中の明細追加→復帰後の一致を確認する。
 * e2e 公開 API に無い setOffline / 複数コンテキストのため Playwright 直接利用。
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
      if (rel.endsWith("/")) {
        rel += "index.html";
      }
      if (rel === "/") {
        rel = "/index.html";
      }
      const filePath = path.join(distApp, rel);
      if (!filePath.startsWith(distApp)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(body);
    } catch {
      try {
        const body = await readFile(path.join(distApp, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(body);
      } catch {
        res.writeHead(404).end("not found");
      }
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
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "verify-relay-"));
  const mod = await import(pathToFileURL(path.join(root, "dist/relay/server.js")).href);
  const relay = await mod.startRelayServer({
    host: "127.0.0.1",
    port: 0,
    dataDir,
  });
  return { relay, dataDir };
}

async function waitForSelector(page, selector, timeoutMs = 20_000) {
  await page.waitForSelector(selector, { timeout: timeoutMs });
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

async function memosOn(page) {
  return page.locator('[data-testid="entry-memo"]').allTextContents();
}

async function main() {
  const { server, port } = await startStaticServer();
  const { relay } = await startRelayFromDist();
  const browser = await chromium.launch({ headless: true });

  const docId = "family-demo";
  const base = `http://127.0.0.1:${port}/?doc=${docId}&relay=${encodeURIComponent(relay.url)}`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto(base, { waitUntil: "networkidle" });
    await pageB.goto(base, { waitUntil: "networkidle" });
    await waitForSelector(pageA, '[data-testid="entry-form"]');
    await waitForSelector(pageB, '[data-testid="entry-form"]');
    await waitForSyncConnected(pageA);
    await waitForSyncConnected(pageB);

    const deviceA = await pageA.locator('[data-testid="device-id"]').innerText();
    const deviceB = await pageB.locator('[data-testid="device-id"]').innerText();
    if (deviceA === deviceB) {
      throw new Error("expected distinct device ids across browser contexts");
    }

    // オンライン同期: A の入力が B に届く
    await fillEntry(pageA, {
      amount: 680,
      category: "食費",
      memo: "コンビニ弁当",
      enteredBy: "たろう",
    });
    await pageB.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-testid="entry-memo"]')].some(
          (node) => node.textContent === "コンビニ弁当",
        ),
      null,
      { timeout: 15_000 },
    );

    // オフライン中に B が新規明細を追加し、復帰後に両方一致
    await contextB.setOffline(true);
    await fillEntry(pageB, {
      amount: 450,
      category: "食費",
      memo: "はなこのパン",
      enteredBy: "はなこ",
    });
    await waitForSelector(pageB, '[data-testid="entry-memo"]');
    const offlineMemos = await memosOn(pageB);
    if (!offlineMemos.includes("はなこのパン")) {
      throw new Error("offline add failed on B");
    }

    await contextB.setOffline(false);
    await waitForSyncConnected(pageB);
    await pageA.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-testid="entry-memo"]')].some(
          (node) => node.textContent === "はなこのパン",
        ),
      null,
      { timeout: 20_000 },
    );
    await pageB.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-testid="entry-memo"]')].some(
          (node) => node.textContent === "コンビニ弁当",
        ),
      null,
      { timeout: 20_000 },
    );

    const memosA = (await memosOn(pageA)).slice().sort();
    const memosB = (await memosOn(pageB)).slice().sort();
    if (JSON.stringify(memosA) !== JSON.stringify(memosB)) {
      throw new Error(`mismatch after reconnect: ${JSON.stringify({ memosA, memosB })}`);
    }
    if (memosA.length !== 2) {
      throw new Error(`expected 2 entries, got ${memosA.length}`);
    }

    console.log(
      JSON.stringify({
        ok: true,
        onlineSync: true,
        offlineAddThenReconnect: true,
        distinctDeviceIds: true,
        memos: memosA,
        relayUrl: relay.url,
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
