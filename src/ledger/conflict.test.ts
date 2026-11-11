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

function applyBothOrders(updateA: Uint8Array, updateB: Uint8Array): [Y.Doc, Y.Doc] {
  const ab = new Y.Doc();
  Y.applyUpdate(ab, updateA);
  Y.applyUpdate(ab, updateB);
  const ba = new Y.Doc();
  Y.applyUpdate(ba, updateB);
  Y.applyUpdate(ba, updateA);
  return [ab, ba];
}

function forkFrom(doc: Y.Doc, clientID: number): Y.Doc {
  const next = new Y.Doc();
  next.clientID = clientID;
  Y.applyUpdate(next, Y.encodeStateAsUpdate(doc));
  return next;
}

describe("field conflicts and edit-wins delete (v0.4.0)", () => {
  it("keeps concurrent edits to different fields", () => {
    const seed = createLedgerDocument();
    addEntry(
      seed,
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      "device-seed",
      () => "shared",
    );
    const entryId = listEntries(seed)[0]!.id;
    const seedUpdate = Y.encodeStateAsUpdate(seed.doc);

    const aDoc = new Y.Doc();
    aDoc.clientID = 11;
    Y.applyUpdate(aDoc, seedUpdate);
    const bDoc = new Y.Doc();
    bDoc.clientID = 22;
    Y.applyUpdate(bDoc, seedUpdate);

    updateEntryFields(createLedgerDocument(aDoc), entryId, { memo: "はなこのメモ" }, "device-a");
    updateEntryFields(createLedgerDocument(bDoc), entryId, { amount: 700 }, "device-b");

    const [ab, ba] = applyBothOrders(Y.encodeStateAsUpdate(aDoc), Y.encodeStateAsUpdate(bDoc));
    const left = listEntries(createLedgerDocument(ab))[0];
    const right = listEntries(createLedgerDocument(ba))[0];
    expect(left).toMatchObject({ memo: "はなこのメモ", amount: 700 });
    expect(right).toEqual(left);
  });

  it("resolves concurrent same-field edits deterministically (not wall clock)", () => {
    const seed = createLedgerDocument();
    addEntry(
      seed,
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      "device-seed",
      () => "amount-race",
    );
    const entryId = listEntries(seed)[0]!.id;
    const seedUpdate = Y.encodeStateAsUpdate(seed.doc);

    const low = new Y.Doc();
    low.clientID = 1;
    Y.applyUpdate(low, seedUpdate);
    const high = new Y.Doc();
    high.clientID = 99;
    Y.applyUpdate(high, seedUpdate);

    updateEntryFields(createLedgerDocument(low), entryId, { amount: 100 }, "device-low");
    updateEntryFields(createLedgerDocument(high), entryId, { amount: 999 }, "device-high");

    const [ab, ba] = applyBothOrders(Y.encodeStateAsUpdate(low), Y.encodeStateAsUpdate(high));
    const left = listEntries(createLedgerDocument(ab))[0]!.amount;
    const right = listEntries(createLedgerDocument(ba))[0]!.amount;
    expect(left).toBe(right);
    // 同じ origin の並行 set では大きい clientID 側が残る（Yjs Item#integrate + Map の末尾エントリ）
    expect(left).toBe(999);
  });

  it("prefers concurrent edit over delete; solo delete hides the entry", () => {
    const seed = createLedgerDocument();
    addEntry(
      seed,
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      "device-seed",
      () => "del-edit",
    );
    const entryId = listEntries(seed)[0]!.id;

    const deleter = forkFrom(seed.doc, 30);
    const editor = forkFrom(seed.doc, 40);
    deleteEntry(createLedgerDocument(deleter), entryId);
    updateEntryFields(
      createLedgerDocument(editor),
      entryId,
      { memo: "じろうが直した" },
      "device-editor",
    );

    const [ab, ba] = applyBothOrders(Y.encodeStateAsUpdate(deleter), Y.encodeStateAsUpdate(editor));
    expect(listEntries(createLedgerDocument(ab))).toHaveLength(1);
    expect(listEntries(createLedgerDocument(ba))).toHaveLength(1);
    expect(listEntries(createLedgerDocument(ab))[0]?.memo).toBe("じろうが直した");
    expect(listEntries(createLedgerDocument(ba))[0]?.memo).toBe("じろうが直した");

    const solo = forkFrom(seed.doc, 50);
    deleteEntry(createLedgerDocument(solo), entryId);
    expect(listEntries(createLedgerDocument(solo))).toHaveLength(0);
  });

  it("keeps edit-wins under duplicate delivery and a third replica", () => {
    const seed = createLedgerDocument();
    addEntry(
      seed,
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      "device-seed",
      () => "triple",
    );
    const entryId = listEntries(seed)[0]!.id;

    const a = forkFrom(seed.doc, 1);
    const b = forkFrom(seed.doc, 2);
    deleteEntry(createLedgerDocument(a), entryId);
    updateEntryFields(createLedgerDocument(b), entryId, { amount: 690 }, "device-b");
    const ua = Y.encodeStateAsUpdate(a);
    const ub = Y.encodeStateAsUpdate(b);

    const orders = [
      [ua, ub, ub],
      [ub, ua, ua],
      [ua, ua, ub],
    ];
    const results = orders.map((order) => {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed.doc));
      for (const update of order) {
        Y.applyUpdate(doc, update);
      }
      return listEntries(createLedgerDocument(doc));
    });
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[0]).toHaveLength(1);
    expect(results[0]![0]?.amount).toBe(690);
  });

  it("computes totals from visible entries only (not stored)", () => {
    const ledger = createLedgerDocument();
    addEntry(
      ledger,
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      "d1",
      () => "t1",
    );
    addEntry(
      ledger,
      {
        date: "2026-11-10",
        amount: 320,
        category: "日用品",
        memo: "石鹸",
        enteredBy: "はなこ",
      },
      "d1",
      () => "t2",
    );
    expect(computeTotalAmount(ledger)).toBe(1000);
    deleteEntry(ledger, "d1:t2");
    expect(computeTotalAmount(ledger)).toBe(680);
  });
});
