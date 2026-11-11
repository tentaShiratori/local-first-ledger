import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

const relayDir = path.dirname(fileURLToPath(import.meta.url));

describe("relay server opacity", () => {
  it("does not import yjs in server, store, or protocol modules", async () => {
    const files = ["server.ts", "store.ts", "protocol.ts", "cli.ts", "index.ts"];
    for (const file of files) {
      const source = await readFile(path.join(relayDir, file), "utf8");
      expect(source).not.toMatch(/from ["']yjs["']/);
      expect(source).not.toMatch(/require\(["']yjs["']\)/);
      expect(source).not.toMatch(/\by-websocket\b/);
    }
  });
});
