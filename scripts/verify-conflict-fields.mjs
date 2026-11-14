/**
 * 2 ブラウザコンテキスト + ローカル中継で、オフライン中の別フィールド同時編集が
 * 復帰後に両方残ることを確認する。
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
    throw new Error("failed to bind");
  }
  return { server, port: address.port };
}

async function startRelayFromDist() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "verify-conflict-"));
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

async function main() {
  const { server, port } = await startStaticServer();
  const relay = await startRelayFromDist();
  const browser = await chromium.launch({ headless: true });
  const base = `http://127.0.0.1:${port}/?doc=family-demo&relay=${encodeURIComponent(relay.url)}`;
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

    await pageA.locator('[data-testid="field-amount"]').fill("680");
    await pageA.locator('[data-testid="field-category"]').fill("食費");
    await pageA.locator('[data-testid="field-memo"]').fill("コンビニ弁当");
    await pageA.locator('[data-testid="submit-entry"]').click();
    await pageA.waitForSelector('[data-testid="entry-item"]');
    await pageB.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-testid="entry-memo"]')].some(
          (node) => node.textContent === "コンビニ弁当",
        ),
      null,
      { timeout: 15_000 },
    );

    await contextA.setOffline(true);
    await contextB.setOffline(true);

    pageA.once("dialog", async (dialog) => {
      await dialog.accept("はなこのメモ");
    });
    await pageA.locator('[data-testid="edit-memo"]').click();
    await pageA.waitForFunction(
      () => document.querySelector('[data-testid="entry-memo"]')?.textContent === "はなこのメモ",
    );

    pageB.once("dialog", async (dialog) => {
      await dialog.accept("700");
    });
    await pageB.locator('[data-testid="edit-amount"]').click();
    await pageB.waitForFunction(
      () => document.querySelector('[data-testid="entry-amount"]')?.textContent === "700円",
    );

    await contextA.setOffline(false);
    await contextB.setOffline(false);
    await waitForSyncConnected(pageA);
    await waitForSyncConnected(pageB);

    await pageA.waitForFunction(
      () => {
        const memo = document.querySelector('[data-testid="entry-memo"]')?.textContent;
        const amount = document.querySelector('[data-testid="entry-amount"]')?.textContent;
        return memo === "はなこのメモ" && amount === "700円";
      },
      null,
      { timeout: 20_000 },
    );
    await pageB.waitForFunction(
      () => {
        const memo = document.querySelector('[data-testid="entry-memo"]')?.textContent;
        const amount = document.querySelector('[data-testid="entry-amount"]')?.textContent;
        return memo === "はなこのメモ" && amount === "700円";
      },
      null,
      { timeout: 20_000 },
    );

    console.log(
      JSON.stringify({
        ok: true,
        offlineConcurrentDifferentFields: true,
        memo: "はなこのメモ",
        amount: 700,
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
