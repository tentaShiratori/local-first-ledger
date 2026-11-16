import type * as Y from "yjs";

import type { LedgerDocument } from "./document.js";
import type { LedgerEntry } from "./entry.js";

/**
 * 明細変更履歴（要件 8）。
 *
 * Yjs にはアプリ向けの「誰がいつ何を」履歴 API がないため、追記専用の
 * Y.Map("entryHistory") にイベントを載せる。
 * キーは `${deviceId}:${deviceSeq}:${uuid}` で常に一意（G-Set 相当）。
 * 並行追加はすべて残り、同じバイナリ更新の再適用は Yjs の冪等性で吸収される。
 *
 * - wallClockMs: 記録端末の壁時計（実時間の目安。同期順や正しさの根拠ではない）
 * - deviceSeq: その端末のローカル操作順（同一端末内の並べ替えに使う。端末間の真の因果は表さない）
 */

export const ENTRY_HISTORY_MAP_KEY = "entryHistory";

export type HistoryKind = "create" | "update" | "delete";

export type HistoryFieldChange = {
  field: string;
  before: string | null;
  after: string | null;
};

export type HistoryEvent = {
  eventId: string;
  entryId: string;
  deviceId: string;
  enteredBy: string;
  kind: HistoryKind;
  deviceSeq: number;
  wallClockMs: number;
  changes: HistoryFieldChange[];
};

export type HistorySeqStore = {
  nextSeq: (deviceId: string) => number;
};

export type HistoryClock = () => number;

export function createMemoryHistorySeqStore(initial = 0): HistorySeqStore {
  const seqs = new Map<string, number>();
  return {
    nextSeq(deviceId) {
      const next = (seqs.get(deviceId) ?? initial) + 1;
      seqs.set(deviceId, next);
      return next;
    },
  };
}

export function createLocalStorageHistorySeqStore(
  storage: Pick<Storage, "getItem" | "setItem">,
): HistorySeqStore {
  return {
    nextSeq(deviceId) {
      const key = `local-first-ledger:history-seq:${deviceId}`;
      const raw = storage.getItem(key);
      const current = raw !== null && raw !== "" ? Number(raw) : 0;
      const base = Number.isInteger(current) && current >= 0 ? current : 0;
      const next = base + 1;
      storage.setItem(key, String(next));
      return next;
    },
  };
}

function historyMap(ledger: LedgerDocument): Y.Map<unknown> {
  return ledger.doc.getMap(ENTRY_HISTORY_MAP_KEY);
}

function isHistoryKind(value: unknown): value is HistoryKind {
  return value === "create" || value === "update" || value === "delete";
}

function isFieldChange(value: unknown): value is HistoryFieldChange {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.field === "string" &&
    (record.before === null || typeof record.before === "string") &&
    (record.after === null || typeof record.after === "string")
  );
}

export function isHistoryEvent(value: unknown): value is HistoryEvent {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.eventId === "string" &&
    typeof record.entryId === "string" &&
    typeof record.deviceId === "string" &&
    typeof record.enteredBy === "string" &&
    isHistoryKind(record.kind) &&
    typeof record.deviceSeq === "number" &&
    Number.isInteger(record.deviceSeq) &&
    typeof record.wallClockMs === "number" &&
    Number.isFinite(record.wallClockMs) &&
    Array.isArray(record.changes) &&
    record.changes.every(isFieldChange)
  );
}

function fieldString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function diffEntryFields(
  before: Partial<LedgerEntry> | null,
  after: Partial<LedgerEntry> | null,
  fields: Array<keyof LedgerEntry> = ["date", "amount", "category", "memo", "enteredBy"],
): HistoryFieldChange[] {
  const changes: HistoryFieldChange[] = [];
  for (const field of fields) {
    const left = before === null ? null : fieldString(before[field] ?? null);
    const right = after === null ? null : fieldString(after[field] ?? null);
    if (left === right) {
      continue;
    }
    changes.push({ field, before: left, after: right });
  }
  return changes;
}

export type AppendHistoryInput = {
  ledger: LedgerDocument;
  entryId: string;
  deviceId: string;
  enteredBy: string;
  kind: HistoryKind;
  changes: HistoryFieldChange[];
  seqStore: HistorySeqStore;
  now?: HistoryClock;
  randomUUID?: () => string;
};

export function appendHistoryEvent(input: AppendHistoryInput): HistoryEvent {
  const deviceSeq = input.seqStore.nextSeq(input.deviceId);
  const uuid = (input.randomUUID ?? (() => crypto.randomUUID()))();
  const eventId = `${input.deviceId}:${deviceSeq}:${uuid}`;
  const event: HistoryEvent = {
    eventId,
    entryId: input.entryId,
    deviceId: input.deviceId,
    enteredBy: input.enteredBy,
    kind: input.kind,
    deviceSeq,
    wallClockMs: (input.now ?? Date.now)(),
    changes: input.changes,
  };
  input.ledger.doc.transact(() => {
    historyMap(input.ledger).set(eventId, event);
  });
  return event;
}

export function listAllHistoryEvents(ledger: LedgerDocument): HistoryEvent[] {
  const result: HistoryEvent[] = [];
  historyMap(ledger).forEach((value) => {
    if (isHistoryEvent(value)) {
      result.push(value);
    }
  });
  return result;
}

export function listHistoryForEntry(ledger: LedgerDocument, entryId: string): HistoryEvent[] {
  return listAllHistoryEvents(ledger).filter((event) => event.entryId === entryId);
}

/** 因果・操作順: deviceSeq と eventId で決定的に並べる（壁時計ではない）。 */
export function sortHistoryCausal(events: HistoryEvent[]): HistoryEvent[] {
  return [...events].sort((a, b) => {
    if (a.deviceId !== b.deviceId) {
      return a.deviceId < b.deviceId ? -1 : 1;
    }
    if (a.deviceSeq !== b.deviceSeq) {
      return a.deviceSeq - b.deviceSeq;
    }
    return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
  });
}

/**
 * 壁時計順: 記録端末の実時間の目安。並行オフラインでは前後が入れ替わり得る。
 * 同値は eventId で決定的にタイブレークする。
 */
export function sortHistoryWallClock(events: HistoryEvent[]): HistoryEvent[] {
  return [...events].sort((a, b) => {
    if (a.wallClockMs !== b.wallClockMs) {
      return a.wallClockMs - b.wallClockMs;
    }
    return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
  });
}

export function observeHistory(
  ledger: LedgerDocument,
  listener: (events: HistoryEvent[]) => void,
): () => void {
  const map = historyMap(ledger);
  const handler = () => {
    listener(listAllHistoryEvents(ledger));
  };
  map.observe(handler);
  return () => {
    map.unobserve(handler);
  };
}
