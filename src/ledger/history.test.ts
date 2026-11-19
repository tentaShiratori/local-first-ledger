import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";

import { addEntry, createLedgerDocument, deleteEntry, updateEntryFields } from "./document.js";
import {
  ENTRY_HISTORY_MAP_KEY,
  appendHistoryEvent,
  createLocalStorageHistorySeqStore,
  createMemoryHistorySeqStore,
  diffEntryFields,
  isHistoryEvent,
  listAllHistoryEvents,
  listHistoryForEntry,
  observeHistory,
  sortHistoryCausal,
  sortHistoryWallClock,
  type HistoryEvent,
} from "./history.js";

describe("entry history", () => {
  it("records create / update / delete with field before→after", () => {
    let clock = 1_000;
    const ledger = createLedgerDocument(new Y.Doc(), {
      historySeqStore: createMemoryHistorySeqStore(),
      historyNow: () => {
        clock += 1;
        return clock;
      },
    });
    const entry = addEntry(
      ledger,
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      "device-a",
      () => "h1",
    );
    updateEntryFields(ledger, entry.id, { memo: "はなこのメモ" }, "device-a", "はなこ");
    deleteEntry(ledger, entry.id, "device-a", "たろう");

    const events = sortHistoryCausal(listHistoryForEntry(ledger, entry.id));
    expect(events.map((event) => event.kind)).toEqual(["create", "update", "delete"]);
    expect(events[1]?.changes).toContainEqual({
      field: "memo",
      before: "コンビニ弁当",
      after: "はなこのメモ",
    });
    expect(events[0]?.enteredBy).toBe("たろう");
    expect(events[1]?.enteredBy).toBe("はなこ");
    expect(events.every((event) => event.deviceId === "device-a")).toBe(true);
  });

  it("converges history across replicas without gaps or duplicates", () => {
    const seqA = createMemoryHistorySeqStore();
    const seqB = createMemoryHistorySeqStore();
    let clockA = 5_000;
    let clockB = 1_000; // B の壁時計は意図的に遅らせ、因果順と実時間をずらす

    const a = createLedgerDocument(new Y.Doc(), {
      historySeqStore: seqA,
      historyNow: () => ++clockA,
    });
    a.doc.clientID = 11;
    const b = createLedgerDocument(new Y.Doc(), {
      historySeqStore: seqB,
      historyNow: () => ++clockB,
    });
    b.doc.clientID = 22;

    const entry = addEntry(
      a,
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      "device-a",
      () => "shared",
    );
    const seed = Y.encodeStateAsUpdate(a.doc);
    Y.applyUpdate(b.doc, seed);

    updateEntryFields(a, entry.id, { amount: 700 }, "device-a", "たろう");
    updateEntryFields(b, entry.id, { memo: "じろう追記" }, "device-b", "じろう");

    const ua = Y.encodeStateAsUpdate(a.doc);
    const ub = Y.encodeStateAsUpdate(b.doc);

    const orders = [
      [ua, ub],
      [ub, ua],
      [ua, ua, ub, ub],
    ];
    const snapshots = orders.map((order) => {
      const doc = new Y.Doc();
      const ledger = createLedgerDocument(doc);
      for (const update of order) {
        Y.applyUpdate(doc, update);
      }
      return sortHistoryCausal(listHistoryForEntry(ledger, entry.id)).map((event) => ({
        eventId: event.eventId,
        kind: event.kind,
        changes: event.changes,
      }));
    });

    expect(snapshots[0]).toEqual(snapshots[1]);
    expect(snapshots[1]).toEqual(snapshots[2]);
    expect(snapshots[0]).toHaveLength(3);
    const ids = new Set(snapshots[0]!.map((event) => event.eventId));
    expect(ids.size).toBe(3);

    // 壁時計順は因果順と異なり得る（B の時計を遅らせている）
    const merged = createLedgerDocument(new Y.Doc());
    Y.applyUpdate(merged.doc, ua);
    Y.applyUpdate(merged.doc, ub);
    const causal = sortHistoryCausal(listAllHistoryEvents(merged)).map((e) => e.eventId);
    const wall = sortHistoryWallClock(listAllHistoryEvents(merged)).map((e) => e.eventId);
    expect(causal).not.toEqual(wall);
  });

  it("covers seq store, validators, observers, and sort ties", () => {
    const memory = new Map<string, string>();
    const storage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
    };
    const seq = createLocalStorageHistorySeqStore(storage);
    expect(seq.nextSeq("d1")).toBe(1);
    expect(seq.nextSeq("d1")).toBe(2);
    memory.set("local-first-ledger:history-seq:d2", "");
    expect(seq.nextSeq("d2")).toBe(1);
    memory.set("local-first-ledger:history-seq:d3", "nope");
    expect(seq.nextSeq("d3")).toBe(1);

    expect(isHistoryEvent(null)).toBe(false);
    expect(isHistoryEvent({})).toBe(false);
    expect(
      isHistoryEvent({
        eventId: "e",
        entryId: "i",
        deviceId: "d",
        enteredBy: "たろう",
        kind: "nope",
        deviceSeq: 1,
        wallClockMs: 1,
        changes: [],
      }),
    ).toBe(false);
    expect(
      isHistoryEvent({
        eventId: "e",
        entryId: "i",
        deviceId: "d",
        enteredBy: "たろう",
        kind: "update",
        deviceSeq: 1.5,
        wallClockMs: 1,
        changes: [],
      }),
    ).toBe(false);
    expect(
      isHistoryEvent({
        eventId: "e",
        entryId: "i",
        deviceId: "d",
        enteredBy: "たろう",
        kind: "update",
        deviceSeq: 1,
        wallClockMs: 1,
        changes: [{ field: "memo", before: 1, after: "x" }],
      }),
    ).toBe(false);

    expect(
      diffEntryFields(
        { date: "2026-11-10", amount: 1, category: "食費", memo: "a", enteredBy: "たろう" },
        { date: "2026-11-10", amount: 1, category: "食費", memo: "a", enteredBy: "たろう" },
      ),
    ).toEqual([]);
    expect(diffEntryFields(null, { memo: "x", amount: true as unknown as number })).toEqual([
      { field: "amount", before: null, after: "true" },
      { field: "memo", before: null, after: "x" },
    ]);
    expect(diffEntryFields({ memo: { nested: 1 } as unknown as string }, null)).toEqual([
      { field: "memo", before: JSON.stringify({ nested: 1 }), after: null },
    ]);

    const ledger = createLedgerDocument();
    const listener = vi.fn();
    const stop = observeHistory(ledger, listener);
    appendHistoryEvent({
      ledger,
      entryId: "entry-1",
      deviceId: "device-z",
      enteredBy: "じろう",
      kind: "create",
      changes: [{ field: "memo", before: null, after: "初" }],
      seqStore: createMemoryHistorySeqStore(),
      now: () => 42,
      randomUUID: () => "uuid-1",
    });
    expect(listener).toHaveBeenCalled();
    stop();

    ledger.doc.getMap(ENTRY_HISTORY_MAP_KEY).set("junk", { not: "event" });
    expect(listAllHistoryEvents(ledger)).toHaveLength(1);

    const base: HistoryEvent = {
      eventId: "a:1:u1",
      entryId: "e",
      deviceId: "a",
      enteredBy: "たろう",
      kind: "update",
      deviceSeq: 1,
      wallClockMs: 10,
      changes: [],
    };
    const twin: HistoryEvent = { ...base, eventId: "a:1:u2", deviceSeq: 1 };
    const other: HistoryEvent = { ...base, eventId: "b:1:u1", deviceId: "b" };
    const sameWall: HistoryEvent = { ...base, eventId: "c:1:u0", deviceId: "c", wallClockMs: 10 };
    expect(sortHistoryCausal([twin, base, other]).map((e) => e.eventId)).toEqual([
      "a:1:u1",
      "a:1:u2",
      "b:1:u1",
    ]);
    expect(sortHistoryWallClock([sameWall, base]).map((e) => e.eventId)).toEqual([
      "a:1:u1",
      "c:1:u0",
    ]);
    expect(sortHistoryCausal([base, base])[0]?.eventId).toBe("a:1:u1");
    expect(sortHistoryWallClock([base, base])[0]?.eventId).toBe("a:1:u1");
  });
});
