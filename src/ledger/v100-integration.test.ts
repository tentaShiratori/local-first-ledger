/**
 * v1.0.0 統合の自動再確認。
 * - 2 レプリカ×各 5 件＋同一明細の並行編集 → 一覧・合計一致
 * - 3 端末の同期順入れ替え・重複配送・削除×編集の編集優先は本ファイルと既存テストで再確認
 * - v0.1.0 の G-Counter / LWW ランダムは src/g-counter.test.ts / src/lww-register.test.ts
 */
import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";

import {
  addEntry,
  computeTotalAmount,
  createLedgerDocument,
  deleteEntry,
  listEntries,
  updateEntryFields,
} from "./document.js";
import { listAllHistoryEvents } from "./history.js";

function snapshot(ledger: ReturnType<typeof createLedgerDocument>) {
  return {
    total: computeTotalAmount(ledger),
    entries: listEntries(ledger)
      .map((entry) => ({
        id: entry.id,
        amount: entry.amount,
        memo: entry.memo,
        category: entry.category,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    historyIds: listAllHistoryEvents(ledger)
      .map((event) => event.eventId)
      .sort(),
  };
}

function applyAll(doc: Y.Doc, updates: Uint8Array[]): void {
  for (const update of updates) {
    Y.applyUpdate(doc, update);
  }
}

describe("v1.0.0 integration regressions", () => {
  it("matches list and total after 2×5 offline adds and concurrent edit", () => {
    const shared = createLedgerDocument();
    shared.doc.clientID = 1;
    const seedEntry = addEntry(
      shared,
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "共有コンビニ弁当",
        enteredBy: "たろう",
      },
      "device-seed",
      () => "shared",
    );
    const seed = Y.encodeStateAsUpdate(shared.doc);

    const a = createLedgerDocument();
    a.doc.clientID = 11;
    Y.applyUpdate(a.doc, seed);
    const b = createLedgerDocument();
    b.doc.clientID = 22;
    Y.applyUpdate(b.doc, seed);

    for (let i = 1; i <= 5; i += 1) {
      addEntry(
        a,
        {
          date: "2026-11-10",
          amount: 100 + i,
          category: "食費",
          memo: `たろう${i}`,
          enteredBy: "たろう",
        },
        "device-a",
        () => `a${i}`,
      );
      addEntry(
        b,
        {
          date: "2026-11-10",
          amount: 200 + i,
          category: "食費",
          memo: `はなこ${i}`,
          enteredBy: "はなこ",
        },
        "device-b",
        () => `b${i}`,
      );
    }

    updateEntryFields(a, seedEntry.id, { memo: "はなこ向けメモ更新" }, "device-a", "たろう");
    updateEntryFields(b, seedEntry.id, { amount: 710 }, "device-b", "はなこ");

    const ua = Y.encodeStateAsUpdate(a.doc);
    const ub = Y.encodeStateAsUpdate(b.doc);

    const left = createLedgerDocument();
    applyAll(left.doc, [ua, ub]);
    const right = createLedgerDocument();
    applyAll(right.doc, [ub, ua, ua, ub]);

    expect(snapshot(left)).toEqual(snapshot(right));
    expect(snapshot(left).entries).toHaveLength(11);
    expect(snapshot(left).total).toBe(
      710 + [101, 102, 103, 104, 105, 201, 202, 203, 204, 205].reduce((s, n) => s + n, 0),
    );
    const sharedEntry = snapshot(left).entries.find((entry) => entry.id === seedEntry.id);
    expect(sharedEntry?.memo).toBe("はなこ向けメモ更新");
    expect(sharedEntry?.amount).toBe(710);
  });

  it("converges across 3 replicas with shuffled order and duplicate delivery", () => {
    const docs = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
    docs[0]!.clientID = 1;
    docs[1]!.clientID = 2;
    docs[2]!.clientID = 3;
    const ledgers = docs.map((doc) => createLedgerDocument(doc));

    addEntry(
      ledgers[0]!,
      {
        date: "2026-11-11",
        amount: 300,
        category: "食費",
        memo: "じろうの弁当",
        enteredBy: "じろう",
      },
      "d0",
      () => "r0",
    );
    addEntry(
      ledgers[1]!,
      {
        date: "2026-11-11",
        amount: 400,
        category: "交通",
        memo: "たろうの切符",
        enteredBy: "たろう",
      },
      "d1",
      () => "r1",
    );
    addEntry(
      ledgers[2]!,
      {
        date: "2026-11-11",
        amount: 500,
        category: "日用品",
        memo: "はなこの洗剤",
        enteredBy: "はなこ",
      },
      "d2",
      () => "r2",
    );

    const updates = docs.map((doc) => Y.encodeStateAsUpdate(doc));
    const orders = [
      [0, 1, 2],
      [2, 0, 1],
      [1, 2, 0, 0, 1, 2],
    ];

    const snaps = orders.map((order) => {
      const doc = new Y.Doc();
      const ledger = createLedgerDocument(doc);
      for (const index of order) {
        Y.applyUpdate(doc, updates[index]!);
      }
      return snapshot(ledger);
    });

    expect(snaps[0]).toEqual(snaps[1]);
    expect(snaps[1]).toEqual(snaps[2]);
    expect(snaps[0]?.entries).toHaveLength(3);
    expect(snaps[0]?.total).toBe(1200);
  });

  it("keeps edit-wins when delete and edit conflict under duplicate delivery", () => {
    const seed = createLedgerDocument();
    const entry = addEntry(
      seed,
      {
        date: "2026-11-12",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      "seed",
      () => "e1",
    );
    const seedUpdate = Y.encodeStateAsUpdate(seed.doc);

    const deleter = createLedgerDocument();
    deleter.doc.clientID = 5;
    Y.applyUpdate(deleter.doc, seedUpdate);
    deleteEntry(deleter, entry.id, "device-del", "たろう");

    const editor = createLedgerDocument();
    editor.doc.clientID = 9;
    Y.applyUpdate(editor.doc, seedUpdate);
    updateEntryFields(editor, entry.id, { memo: "じろうが直した" }, "device-edit", "じろう");

    const delU = Y.encodeStateAsUpdate(deleter.doc);
    const editU = Y.encodeStateAsUpdate(editor.doc);

    for (const order of [
      [delU, editU],
      [editU, delU],
      [delU, delU, editU, editU],
    ]) {
      const doc = new Y.Doc();
      const ledger = createLedgerDocument(doc);
      applyAll(doc, order);
      const listed = listEntries(ledger);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.memo).toBe("じろうが直した");
    }
  });
});
