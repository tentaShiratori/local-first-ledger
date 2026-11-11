import * as Y from "yjs";

import { isLedgerEntry, type LedgerEntry, type NewLedgerEntryInput } from "./entry.js";

/** 明細の改訂カウンタ（端末ごとの単調増分）。削除墓石との因果比較に使う。 */
const REV_KEY = "rev";

export function createEntryYMap(entry: LedgerEntry, deviceId: string): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set("id", entry.id);
  map.set("date", entry.date);
  map.set("amount", entry.amount);
  map.set("category", entry.category);
  map.set("memo", entry.memo);
  map.set("enteredBy", entry.enteredBy);
  const rev = new Y.Map<number>();
  rev.set(deviceId, 1);
  map.set(REV_KEY, rev);
  return map;
}

export function readEntryFromYMap(value: unknown): LedgerEntry | null {
  if (value instanceof Y.Map) {
    const record: Record<string, unknown> = {
      id: value.get("id"),
      date: value.get("date"),
      amount: value.get("amount"),
      category: value.get("category"),
      memo: value.get("memo"),
      enteredBy: value.get("enteredBy"),
    };
    return isLedgerEntry(record) ? record : null;
  }
  // v0.3.0 以前のプレーンオブジェクト（移行前）
  if (isLedgerEntry(value)) {
    return value;
  }
  return null;
}

function getRevMap(entryMap: Y.Map<unknown>): Y.Map<number> {
  const existing = entryMap.get(REV_KEY);
  if (existing instanceof Y.Map) {
    return existing as Y.Map<number>;
  }
  const rev = new Y.Map<number>();
  entryMap.set(REV_KEY, rev);
  return rev;
}

function bumpRev(entryMap: Y.Map<unknown>, deviceId: string): void {
  const rev = getRevMap(entryMap);
  const current = rev.get(deviceId) ?? 0;
  rev.set(deviceId, current + 1);
}

export function snapshotRev(entryMap: Y.Map<unknown>): Y.Map<number> {
  const snap = new Y.Map<number>();
  const rev = getRevMap(entryMap);
  rev.forEach((value, key) => {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      snap.set(key, value);
    }
  });
  return snap;
}

export function revDominates(current: Y.Map<number>, tombstone: Y.Map<number>): boolean {
  let dominates = false;
  current.forEach((value, key) => {
    if (typeof value !== "number") {
      return;
    }
    const against = tombstone.get(key) ?? 0;
    if (value > against) {
      dominates = true;
    }
  });
  return dominates;
}

/** プレーンな LedgerEntry をネスト Y.Map へ変換（移行用）。 */
export function plainEntryToYMap(entry: LedgerEntry, deviceId: string): Y.Map<unknown> {
  return createEntryYMap(entry, deviceId);
}

export function applyFieldInput(
  entryMap: Y.Map<unknown>,
  patch: Partial<NewLedgerEntryInput>,
  deviceId: string,
): void {
  if (patch.date !== undefined) {
    entryMap.set("date", patch.date);
  }
  if (patch.amount !== undefined) {
    if (!Number.isFinite(patch.amount) || !Number.isInteger(patch.amount)) {
      throw new Error("amount must be a finite integer");
    }
    entryMap.set("amount", patch.amount);
  }
  if (patch.category !== undefined) {
    entryMap.set("category", patch.category);
  }
  if (patch.memo !== undefined) {
    entryMap.set("memo", patch.memo);
  }
  if (patch.enteredBy !== undefined) {
    entryMap.set("enteredBy", patch.enteredBy);
  }
  bumpRev(entryMap, deviceId);
}
