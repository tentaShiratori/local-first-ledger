import * as Y from "yjs";

import {
  createEntryId,
  createLedgerEntry,
  type LedgerEntry,
  type NewLedgerEntryInput,
} from "./entry.js";
import {
  applyFieldInput,
  createEntryYMap,
  plainEntryToYMap,
  readEntryFromYMap,
  revDominates,
  snapshotRev,
} from "./entry-map.js";
import {
  appendHistoryEvent,
  createMemoryHistorySeqStore,
  diffEntryFields,
  type HistoryClock,
  type HistorySeqStore,
} from "./history.js";

export const ENTRIES_MAP_KEY = "entries";
export const TOMBSTONES_MAP_KEY = "tombstones";

export type LedgerDocument = {
  doc: Y.Doc;
  entries: Y.Map<unknown>;
  tombstones: Y.Map<unknown>;
  budgetP: Y.Map<number>;
  budgetN: Y.Map<number>;
  /** 履歴追記用。未設定なら create 時にメモリ実装を付ける。 */
  historySeqStore: HistorySeqStore;
  historyNow: HistoryClock;
};

export type CreateLedgerDocumentOptions = {
  historySeqStore?: HistorySeqStore;
  historyNow?: HistoryClock;
};

export function createLedgerDocument(
  doc: Y.Doc = new Y.Doc(),
  options: CreateLedgerDocumentOptions = {},
): LedgerDocument {
  return {
    doc,
    entries: doc.getMap(ENTRIES_MAP_KEY),
    tombstones: doc.getMap(TOMBSTONES_MAP_KEY),
    budgetP: doc.getMap("budgetP"),
    budgetN: doc.getMap("budgetN"),
    historySeqStore: options.historySeqStore ?? createMemoryHistorySeqStore(),
    historyNow: options.historyNow ?? Date.now,
  };
}

/**
 * v0.3.0 以前のプレーン明細オブジェクトを、ネスト Y.Map へその場で昇格する。
 * 既に Y.Map なら何もしない。
 */
export function migratePlainEntriesToNestedMaps(ledger: LedgerDocument, deviceId: string): number {
  let migrated = 0;
  const upgrades: Array<{ id: string; map: Y.Map<unknown> }> = [];
  ledger.entries.forEach((value, id) => {
    if (value instanceof Y.Map) {
      return;
    }
    const entry = readEntryFromYMap(value);
    if (entry === null) {
      return;
    }
    upgrades.push({ id, map: plainEntryToYMap(entry, deviceId) });
  });
  if (upgrades.length === 0) {
    return 0;
  }
  ledger.doc.transact(() => {
    for (const item of upgrades) {
      ledger.entries.set(item.id, item.map);
      migrated += 1;
    }
  });
  return migrated;
}

export function isEntryVisible(ledger: LedgerDocument, entryId: string): boolean {
  const raw = ledger.entries.get(entryId);
  if (!(raw instanceof Y.Map)) {
    if (readEntryFromYMap(raw) === null) {
      return false;
    }
    return !ledger.tombstones.has(entryId);
  }
  const tomb = ledger.tombstones.get(entryId);
  if (!(tomb instanceof Y.Map)) {
    return true;
  }
  const rev = raw.get("rev");
  if (!(rev instanceof Y.Map)) {
    return false;
  }
  return revDominates(rev as Y.Map<number>, tomb as Y.Map<number>);
}

export function listEntries(ledger: LedgerDocument): LedgerEntry[] {
  const result: LedgerEntry[] = [];
  ledger.entries.forEach((value, id) => {
    if (!isEntryVisible(ledger, id)) {
      return;
    }
    const entry = readEntryFromYMap(value);
    if (entry !== null) {
      result.push(entry);
    }
  });
  return result.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

export function addEntry(
  ledger: LedgerDocument,
  input: NewLedgerEntryInput,
  deviceId: string,
  randomUUID: () => string = () => crypto.randomUUID(),
): LedgerEntry {
  const entry = createLedgerEntry(input, () => createEntryId(deviceId, randomUUID));
  const map = createEntryYMap(entry, deviceId);
  ledger.doc.transact(() => {
    ledger.entries.set(entry.id, map);
    if (ledger.tombstones.has(entry.id)) {
      ledger.tombstones.delete(entry.id);
    }
  });
  appendHistoryEvent({
    ledger,
    entryId: entry.id,
    deviceId,
    enteredBy: entry.enteredBy,
    kind: "create",
    changes: diffEntryFields(null, entry),
    seqStore: ledger.historySeqStore,
    now: ledger.historyNow,
  });
  return entry;
}

export function updateEntryFields(
  ledger: LedgerDocument,
  entryId: string,
  patch: Partial<NewLedgerEntryInput>,
  deviceId: string,
  enteredBy?: string,
): LedgerEntry {
  const before = readEntryFromYMap(ledger.entries.get(entryId));
  const raw = ledger.entries.get(entryId);
  if (!(raw instanceof Y.Map)) {
    const plain = readEntryFromYMap(raw);
    if (plain === null) {
      throw new Error(`entry not found: ${entryId}`);
    }
    ledger.doc.transact(() => {
      const map = plainEntryToYMap(plain, deviceId);
      applyFieldInput(map, patch, deviceId);
      ledger.entries.set(entryId, map);
    });
  } else {
    ledger.doc.transact(() => {
      applyFieldInput(raw, patch, deviceId);
    });
  }
  const updated = readEntryFromYMap(ledger.entries.get(entryId));
  if (updated === null) {
    throw new Error(`entry unreadable after update: ${entryId}`);
  }
  const actor = enteredBy ?? updated.enteredBy;
  appendHistoryEvent({
    ledger,
    entryId,
    deviceId,
    enteredBy: actor,
    kind: "update",
    changes: diffEntryFields(before, updated),
    seqStore: ledger.historySeqStore,
    now: ledger.historyNow,
  });
  return updated;
}

/**
 * 編集優先の削除: 親キーは消さず、削除時点の rev スナップショットを墓石として残す。
 * 因果を知らない並行編集が rev を進めれば、一覧では明細が残る。
 */
export function deleteEntry(
  ledger: LedgerDocument,
  entryId: string,
  deviceId = "unknown-device",
  enteredBy = "不明",
): void {
  const before = readEntryFromYMap(ledger.entries.get(entryId));
  const raw = ledger.entries.get(entryId);
  if (!(raw instanceof Y.Map)) {
    const plain = readEntryFromYMap(raw);
    if (plain === null) {
      return;
    }
    ledger.doc.transact(() => {
      const map = plainEntryToYMap(plain, "migration");
      ledger.entries.set(entryId, map);
      ledger.tombstones.set(entryId, snapshotRev(map));
    });
  } else {
    ledger.doc.transact(() => {
      ledger.tombstones.set(entryId, snapshotRev(raw));
    });
  }
  appendHistoryEvent({
    ledger,
    entryId,
    deviceId,
    enteredBy,
    kind: "delete",
    changes: diffEntryFields(before, null),
    seqStore: ledger.historySeqStore,
    now: ledger.historyNow,
  });
}

/** 表示上の合計。永続化しない。削除済みは含めない。 */
export function computeTotalAmount(ledger: LedgerDocument): number {
  return listEntries(ledger).reduce((sum, entry) => sum + entry.amount, 0);
}

export function observeEntries(
  ledger: LedgerDocument,
  listener: (entries: LedgerEntry[]) => void,
): () => void {
  const handler = () => {
    listener(listEntries(ledger));
  };
  ledger.entries.observeDeep(handler);
  ledger.tombstones.observeDeep(handler);
  return () => {
    ledger.entries.unobserveDeep(handler);
    ledger.tombstones.unobserveDeep(handler);
  };
}
