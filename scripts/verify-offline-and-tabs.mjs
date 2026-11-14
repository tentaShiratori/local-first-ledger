/**
 * e2e パッケージの公開 API では context.setOffline / 複数タブ操作が無いため、
 * @e2e-dev/web が使う Playwright でオフライン起動と複数タブを追加検証する補助スクリプト。
 * ユーザー向けランナーは e2e のまま。このファイルは証拠用。
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
      // SPA / SW navigateFallback 相当
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
    throw new Error("failed to bind");
  }
  return { server, port: address.port };
}

async function waitForSelector(page, selector, timeoutMs = 15_000) {
  await page.waitForSelector(selector, { timeout: timeoutMs });
}

async function main() {
  const { server, port } = await startStaticServer();
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(base, { waitUntil: "networkidle" });
    await waitForSelector(page, '[data-testid="entry-form"]');

    // Service Worker 登録を待つ
    await page.waitForFunction(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length > 0;
    });
    // 制御開始を待つ
    await page
      .waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
        timeout: 20_000,
      })
      .catch(() => {
        // controller がまだでも cache 済みなら reload 後に効くことがある
      });

    // 一度リロードして SW 制御下にする
    await page.reload({ waitUntil: "networkidle" });
    await waitForSelector(page, '[data-testid="entry-form"]');

    await page.locator('[data-testid="field-amount"]').fill("480");
    await page.locator('[data-testid="field-category"]').fill("食費");
    await page.locator('[data-testid="field-memo"]').fill("架空スーパーのパン");
    await page.locator('[data-testid="submit-entry"]').click();
    await waitForSelector(page, '[data-testid="entry-item"]');

    const deviceId = await page.locator('[data-testid="device-id"]').innerText();

    // オフライン起動: ネットワーク遮断後にリロードしても入力画面へ到達
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForSelector(page, '[data-testid="entry-form"]');
    await waitForSelector(page, '[data-testid="entry-memo"]');
    const memoOffline = await page.locator('[data-testid="entry-memo"]').innerText();
    if (memoOffline !== "架空スーパーのパン") {
      throw new Error(`offline restore failed: ${memoOffline}`);
    }
    const deviceIdOffline = await page.locator('[data-testid="device-id"]').innerText();
    if (deviceIdOffline !== deviceId) {
      throw new Error("device id changed while offline");
    }

    await context.setOffline(false);

    // 複数タブ: 2 つ目は follower 警告
    const page2 = await context.newPage();
    await page2.goto(base, { waitUntil: "networkidle" });
    await waitForSelector(page2, '[data-testid="tab-role"]');
    const role2 = await page2.locator('[data-testid="tab-role"]').innerText();
    if (role2 !== "follower") {
      throw new Error(`expected follower, got ${role2}`);
    }
    const warningVisible = await page2.locator('[data-testid="tab-warning"]').isVisible();
    if (!warningVisible) {
      throw new Error("follower warning not visible");
    }
    const submitDisabled = await page2.locator('[data-testid="submit-entry"]').isDisabled();
    if (!submitDisabled) {
      throw new Error("follower submit should be disabled");
    }

    console.log(
      JSON.stringify({
        ok: true,
        offlineStartup: true,
        multiTabSingleWriter: true,
        deviceIdStableOffline: true,
      }),
    );
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
