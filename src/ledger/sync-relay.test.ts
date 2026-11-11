import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";

import { createNodeWebSocketFactory } from "../relay/node-ws.js";
import { startRelayServer, type RelayServer } from "../relay/server.js";
import { createFileUpdateLogStore } from "../relay/store.js";
import { addEntry, createLedgerDocument, listEntries } from "./document.js";
import { createMemoryOutboundQueue, createMemorySyncCursor } from "./outbound-queue.js";
import { createLedgerSyncClient, type LedgerSyncClient } from "./sync-client.js";

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 10_000,
  intervalMs = 20,
): Promise<void> {
  const started = Date.now();
  while (true) {
    if (await predicate()) {
      return;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error("timeout waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

function entrySnapshot(doc: Y.Doc) {
  return listEntries(createLedgerDocument(doc)).map((entry) => ({
    id: entry.id,
    amount: entry.amount,
    memo: entry.memo,
    enteredBy: entry.enteredBy,
  }));
}

function sortedJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

type Harness = {
  server: RelayServer;
  clients: Array<{ doc: Y.Doc; sync: LedgerSyncClient; deviceId: string }>;
  stopAll: () => Promise<void>;
};

async function startHarness(replicaCount: number, dataDir?: string): Promise<Harness> {
  const server = await startRelayServer({
    host: "127.0.0.1",
    port: 0,
    ...(dataDir === undefined
      ? { store: createFileUpdateLogStore(await mkdtemp(path.join(os.tmpdir(), "relay-mem-"))) }
      : { dataDir }),
  });
  const createWebSocket = createNodeWebSocketFactory();
  const clients = Array.from({ length: replicaCount }, (_, index) => {
    const doc = new Y.Doc();
    const deviceId = `device-${index + 1}`;
    const sync = createLedgerSyncClient({
      doc,
      docId: "family-demo",
      relayUrl: server.url,
      createWebSocket,
      outbound: createMemoryOutboundQueue(),
      cursor: createMemorySyncCursor(),
      reconnectDelayMs: 50,
    });
    sync.start();
    return { doc, sync, deviceId };
  });

  await waitFor(() => clients.every((client) => client.sync.status() === "connected"));

  return {
    server,
    clients,
    stopAll: async () => {
      for (const client of clients) {
        client.sync.stop();
        client.doc.destroy();
      }
      await server.close();
    },
  };
}

describe("relay differential sync", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanups.length > 0) {
      const stop = cleanups.pop();
      if (stop) {
        await stop();
      }
    }
  });

  it("delivers one client's entry to the other until both match", async () => {
    const harness = await startHarness(2);
    cleanups.push(harness.stopAll);

    const [a, b] = harness.clients;
    addEntry(
      createLedgerDocument(a!.doc),
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      a!.deviceId,
      () => "e-bentou",
    );

    await waitFor(() => entrySnapshot(b!.doc).some((entry) => entry.memo === "コンビニ弁当"));
    expect(entrySnapshot(a!.doc)).toEqual(entrySnapshot(b!.doc));
  });

  it("converges after both clients edit while disconnected", { timeout: 20_000 }, async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "relay-offline-"));
    const store = createFileUpdateLogStore(dataDir);
    const createWebSocket = createNodeWebSocketFactory();

    const server = await startRelayServer({ host: "127.0.0.1", port: 0, store });
    const port = server.port;
    const clients = [0, 1].map((index) => {
      const doc = new Y.Doc();
      const sync = createLedgerSyncClient({
        doc,
        docId: "family-demo",
        relayUrl: `ws://127.0.0.1:${port}`,
        createWebSocket,
        outbound: createMemoryOutboundQueue(),
        cursor: createMemorySyncCursor(),
        reconnectDelayMs: 80,
      });
      sync.start();
      return { doc, sync, deviceId: `device-${index + 1}` };
    });
    await waitFor(() => clients.every((client) => client.sync.status() === "connected"));

    await server.close();
    await waitFor(() => clients.every((client) => client.sync.status() !== "connected"));

    const [a, b] = clients;
    addEntry(
      createLedgerDocument(a!.doc),
      {
        date: "2026-11-10",
        amount: 450,
        category: "食費",
        memo: "はなこのパン",
        enteredBy: "はなこ",
      },
      a!.deviceId,
      () => "offline-a",
    );
    addEntry(
      createLedgerDocument(b!.doc),
      {
        date: "2026-11-10",
        amount: 320,
        category: "日用品",
        memo: "じろうの石鹸",
        enteredBy: "じろう",
      },
      b!.deviceId,
      () => "offline-b",
    );

    // 未送信キューへ載るのを待つ
    await new Promise((resolve) => setTimeout(resolve, 50));

    const server2 = await startRelayServer({ host: "127.0.0.1", port, store });
    cleanups.push(async () => {
      for (const client of clients) {
        client.sync.stop();
        client.doc.destroy();
      }
      await server2.close();
    });

    await waitFor(() => clients.every((client) => client.sync.status() === "connected"));
    await waitFor(() => {
      const left = entrySnapshot(a!.doc);
      const right = entrySnapshot(b!.doc);
      return left.length === 2 && sortedJson(left) === sortedJson(right);
    });
  });

  it("keeps read values stable when the same update is delivered twice", async () => {
    const harness = await startHarness(2);
    cleanups.push(harness.stopAll);
    const [a, b] = harness.clients;

    addEntry(
      createLedgerDocument(a!.doc),
      {
        date: "2026-11-10",
        amount: 100,
        category: "食費",
        memo: "重複配送テスト",
        enteredBy: "たろう",
      },
      a!.deviceId,
      () => "dup-1",
    );
    await waitFor(() => entrySnapshot(b!.doc).length === 1);
    const before = entrySnapshot(b!.doc);
    const update = Y.encodeStateAsUpdate(a!.doc);
    Y.applyUpdate(b!.doc, update);
    Y.applyUpdate(b!.doc, update);
    expect(entrySnapshot(b!.doc)).toEqual(before);
  });

  it("converges when an older update arrives late", async () => {
    const docLate = new Y.Doc();
    const docFresh = new Y.Doc();
    const ledgerLate = createLedgerDocument(docLate);
    const ledgerFresh = createLedgerDocument(docFresh);

    addEntry(
      ledgerLate,
      {
        date: "2026-11-09",
        amount: 200,
        category: "食費",
        memo: "古い更新",
        enteredBy: "たろう",
      },
      "device-late",
      () => "old",
    );
    const oldUpdate = Y.encodeStateAsUpdate(docLate);

    addEntry(
      ledgerFresh,
      {
        date: "2026-11-10",
        amount: 300,
        category: "食費",
        memo: "新しい更新",
        enteredBy: "はなこ",
      },
      "device-fresh",
      () => "new",
    );
    const newUpdate = Y.encodeStateAsUpdate(docFresh);

    const targetA = new Y.Doc();
    const targetB = new Y.Doc();
    Y.applyUpdate(targetA, newUpdate);
    Y.applyUpdate(targetA, oldUpdate);
    Y.applyUpdate(targetB, oldUpdate);
    Y.applyUpdate(targetB, newUpdate);

    expect(entrySnapshot(targetA)).toEqual(entrySnapshot(targetB));
    expect(entrySnapshot(targetA)).toHaveLength(2);
  });

  it("converges across 3 replicas with shuffled update delivery", async () => {
    const replicas = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
    const updates: Uint8Array[] = [];

    for (const [index, doc] of replicas.entries()) {
      addEntry(
        createLedgerDocument(doc),
        {
          date: "2026-11-10",
          amount: 100 + index,
          category: "食費",
          memo: `レプリカ${index + 1}`,
          enteredBy: "たろう",
        },
        `device-${index + 1}`,
        () => `r${index + 1}`,
      );
      updates.push(Y.encodeStateAsUpdate(doc));
    }

    const orders = [
      [0, 1, 2],
      [2, 0, 1],
      [1, 2, 0],
    ] as const;
    const results = orders.map((order) => {
      const doc = new Y.Doc();
      for (const index of order) {
        Y.applyUpdate(doc, updates[index]!);
      }
      return entrySnapshot(doc);
    });

    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[0]).toHaveLength(3);
  });

  it(
    "restores the same state for a new client after server process restart",
    { timeout: 20_000 },
    async () => {
      const dataDir = await mkdtemp(path.join(os.tmpdir(), "relay-restart-"));
      const first = await startRelayServer({ host: "127.0.0.1", port: 0, dataDir });
      const createWebSocket = createNodeWebSocketFactory();
      const docA = new Y.Doc();
      const syncA = createLedgerSyncClient({
        doc: docA,
        docId: "family-demo",
        relayUrl: first.url,
        createWebSocket,
        outbound: createMemoryOutboundQueue(),
        cursor: createMemorySyncCursor(),
      });
      syncA.start();
      await waitFor(() => syncA.status() === "connected");
      addEntry(
        createLedgerDocument(docA),
        {
          date: "2026-11-10",
          amount: 680,
          category: "食費",
          memo: "再起動後も残る弁当",
          enteredBy: "たろう",
        },
        "device-a",
        () => "restart-1",
      );
      await waitFor(async () => (await first.store.headSeq("family-demo")) >= 1);
      syncA.stop();
      docA.destroy();
      await first.close();

      const second = await startRelayServer({ host: "127.0.0.1", port: 0, dataDir });
      cleanups.push(async () => {
        await second.close();
      });
      const docB = new Y.Doc();
      const syncB = createLedgerSyncClient({
        doc: docB,
        docId: "family-demo",
        relayUrl: second.url,
        createWebSocket,
        outbound: createMemoryOutboundQueue(),
        cursor: createMemorySyncCursor(0),
      });
      syncB.start();
      await waitFor(() => syncB.status() === "connected");
      await waitFor(() => entrySnapshot(docB).some((entry) => entry.memo === "再起動後も残る弁当"));
      syncB.stop();
      docB.destroy();
    },
  );

  it("stores only opaque byte frames (no ledger JSON document)", async () => {
    const harness = await startHarness(2);
    cleanups.push(harness.stopAll);
    const [a] = harness.clients;
    addEntry(
      createLedgerDocument(a!.doc),
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "ワイヤはバイト列",
        enteredBy: "たろう",
      },
      a!.deviceId,
      () => "wire-1",
    );
    await waitFor(async () => (await harness.server.store.headSeq("family-demo")) >= 1);
    const stored = await harness.server.store.readFrom("family-demo", 0);
    expect(stored.length).toBeGreaterThan(0);
    for (const row of stored) {
      expect(row.bytes).toBeInstanceOf(Uint8Array);
      expect(row.bytes.byteLength).toBeGreaterThan(0);
    }
    // 保管は length-prefixed の opaque フレームのみ。サーバーは Y.Doc を持たない。
    expect(await harness.server.store.headSeq("family-demo")).toBe(stored.length);
  });
});
