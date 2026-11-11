import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";

import { createMemoryOutboundQueue, createMemorySyncCursor } from "./outbound-queue.js";
import { createLedgerSyncClient, resolveRelayUrl } from "./sync-client.js";
import { resolveSharedDocumentId } from "./document-id.js";
import { legacyDeviceDocumentName, ledgerDocumentName } from "./constants.js";

describe("sync client configuration helpers", () => {
  it("resolves relay url from query, storage, then default", () => {
    const storage = new Map<string, string>();
    const fromQuery = resolveRelayUrl({
      searchParams: new URLSearchParams("relay=ws://example.test:9"),
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
      },
    });
    expect(fromQuery).toBe("ws://example.test:9");
    expect(storage.get("local-first-ledger:relay-url")).toBe("ws://example.test:9");

    expect(
      resolveRelayUrl({
        storage: {
          getItem: (key) => storage.get(key) ?? null,
          setItem: (key, value) => {
            storage.set(key, value);
          },
        },
      }),
    ).toBe("ws://example.test:9");

    expect(resolveRelayUrl({ defaultUrl: "ws://custom:1" })).toBe("ws://custom:1");
    expect(resolveRelayUrl({})).toBe("ws://127.0.0.1:8787");
  });

  it("falls back when stored shared doc id is unsafe", () => {
    const id = resolveSharedDocumentId({
      storage: {
        getItem: () => "../bad",
        setItem: () => undefined,
      },
    });
    expect(id).toBe("family-demo");
  });

  it("keeps legacy and shared document names distinct", () => {
    expect(legacyDeviceDocumentName("dev-1")).toBe("local-first-ledger:entries:dev-1");
    expect(ledgerDocumentName("family-demo")).toBe("local-first-ledger:entries:family-demo");
  });

  it("ignores double start and returns to idle on stop", () => {
    const doc = new Y.Doc();
    const stubClient = createLedgerSyncClient({
      doc,
      docId: "family-demo",
      relayUrl: "ws://127.0.0.1:1",
      createWebSocket: () => ({
        readyState: 0,
        send() {},
        close() {},
        addEventListener() {},
        removeEventListener() {},
      }),
      outbound: createMemoryOutboundQueue(),
      cursor: createMemorySyncCursor(),
    });
    stubClient.start();
    stubClient.start();
    expect(stubClient.status()).toBe("connecting");
    stubClient.stop();
    expect(stubClient.status()).toBe("idle");
    doc.destroy();
  });
});
