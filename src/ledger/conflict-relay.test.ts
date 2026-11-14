import { afterEach, describe, it } from "vite-plus/test";
import * as Y from "yjs";

import { createNodeWebSocketFactory } from "../relay/node-ws.js";
import { startRelayServer, type RelayServer } from "../relay/server.js";
import { createMemoryUpdateLogStore } from "../relay/store.js";
import {
  addEntry,
  createLedgerDocument,
  deleteEntry,
  listEntries,
  updateEntryFields,
} from "./document.js";
import { createMemoryOutboundQueue, createMemorySyncCursor } from "./outbound-queue.js";
import { createLedgerSyncClient } from "./sync-client.js";

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const started = Date.now();
  while (true) {
    if (await predicate()) {
      return;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error("timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("conflict scenarios over relay", () => {
  let server: RelayServer | undefined;
  const cleanups: Array<() => void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
    await server?.close();
    server = undefined;
  });

  it("syncs concurrent different-field edits through the relay", { timeout: 20_000 }, async () => {
    server = await startRelayServer({
      host: "127.0.0.1",
      port: 0,
      store: createMemoryUpdateLogStore(),
    });
    const createWebSocket = createNodeWebSocketFactory();

    const docA = new Y.Doc();
    docA.clientID = 11;
    const docB = new Y.Doc();
    docB.clientID = 22;
    const syncA = createLedgerSyncClient({
      doc: docA,
      docId: "family-demo",
      relayUrl: server.url,
      createWebSocket,
      outbound: createMemoryOutboundQueue(),
      cursor: createMemorySyncCursor(),
      reconnectDelayMs: 50,
    });
    const syncB = createLedgerSyncClient({
      doc: docB,
      docId: "family-demo",
      relayUrl: server.url,
      createWebSocket,
      outbound: createMemoryOutboundQueue(),
      cursor: createMemorySyncCursor(),
      reconnectDelayMs: 50,
    });
    syncA.start();
    syncB.start();
    cleanups.push(() => {
      syncA.stop();
      syncB.stop();
      docA.destroy();
      docB.destroy();
    });
    await waitFor(() => syncA.status() === "connected" && syncB.status() === "connected");

    const entry = addEntry(
      createLedgerDocument(docA),
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      "device-a",
      () => "relay-fields",
    );
    await waitFor(() => listEntries(createLedgerDocument(docB)).some((e) => e.id === entry.id));

    updateEntryFields(createLedgerDocument(docA), entry.id, { memo: "中継メモ" }, "device-a");
    updateEntryFields(createLedgerDocument(docB), entry.id, { amount: 710 }, "device-b");

    await waitFor(() => {
      const a = listEntries(createLedgerDocument(docA))[0];
      const b = listEntries(createLedgerDocument(docB))[0];
      return (
        a?.memo === "中継メモ" && a.amount === 710 && b?.memo === "中継メモ" && b.amount === 710
      );
    });
  });

  it("keeps edit-wins delete conflict through the relay", { timeout: 20_000 }, async () => {
    server = await startRelayServer({
      host: "127.0.0.1",
      port: 0,
      store: createMemoryUpdateLogStore(),
    });
    const createWebSocket = createNodeWebSocketFactory();
    const docA = new Y.Doc();
    docA.clientID = 31;
    const docB = new Y.Doc();
    docB.clientID = 32;
    const syncA = createLedgerSyncClient({
      doc: docA,
      docId: "family-demo",
      relayUrl: server.url,
      createWebSocket,
      outbound: createMemoryOutboundQueue(),
      cursor: createMemorySyncCursor(),
      reconnectDelayMs: 50,
    });
    const syncB = createLedgerSyncClient({
      doc: docB,
      docId: "family-demo",
      relayUrl: server.url,
      createWebSocket,
      outbound: createMemoryOutboundQueue(),
      cursor: createMemorySyncCursor(),
      reconnectDelayMs: 50,
    });
    syncA.start();
    syncB.start();
    cleanups.push(() => {
      syncA.stop();
      syncB.stop();
      docA.destroy();
      docB.destroy();
    });
    await waitFor(() => syncA.status() === "connected" && syncB.status() === "connected");

    const entry = addEntry(
      createLedgerDocument(docA),
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      "device-a",
      () => "relay-del",
    );
    await waitFor(() => listEntries(createLedgerDocument(docB)).some((e) => e.id === entry.id));

    // 一時切断して並行に削除と編集
    const port = server.port;
    const store = server.store;
    await server.close();
    server = undefined;
    await waitFor(() => syncA.status() !== "connected" && syncB.status() !== "connected");

    deleteEntry(createLedgerDocument(docA), entry.id);
    updateEntryFields(createLedgerDocument(docB), entry.id, { memo: "残る編集" }, "device-b");
    await new Promise((resolve) => setTimeout(resolve, 40));

    server = await startRelayServer({ host: "127.0.0.1", port, store });
    await waitFor(() => syncA.status() === "connected" && syncB.status() === "connected");
    await waitFor(() => {
      const a = listEntries(createLedgerDocument(docA));
      const b = listEntries(createLedgerDocument(docB));
      return (
        a.length === 1 && b.length === 1 && a[0]?.memo === "残る編集" && b[0]?.memo === "残る編集"
      );
    });
  });
});
