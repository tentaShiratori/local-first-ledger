import type { LedgerEntry } from "./entry.js";

/**
 * 重複候補のヒューリスティック（要件 6）。
 *
 * 閾値（docs と一致させること）:
 * 1. 明細 ID が異なる
 * 2. 日付が一致
 * 3. 金額が一致
 * 4. 次のいずれか: カテゴリ一致 / 正規化メモが一致 / 短い方の正規化メモが長い方に含まれる（長さ ≥ 2）
 *
 * 候補表示だけでは明細を消さない。
 */

export type DuplicatePair = {
  leftId: string;
  rightId: string;
  reason: string;
};

function normalizeMemo(memo: string): string {
  return memo.trim().toLowerCase().replace(/\s+/g, "");
}

function memosNearlyEqual(a: string, b: string): boolean {
  const left = normalizeMemo(a);
  const right = normalizeMemo(b);
  if (left.length === 0 && right.length === 0) {
    return true;
  }
  if (left === right) {
    return true;
  }
  if (left.length >= 2 && right.includes(left)) {
    return true;
  }
  if (right.length >= 2 && left.includes(right)) {
    return true;
  }
  return false;
}

export function isDuplicateCandidate(a: LedgerEntry, b: LedgerEntry): boolean {
  if (a.id === b.id) {
    return false;
  }
  if (a.date !== b.date) {
    return false;
  }
  if (a.amount !== b.amount) {
    return false;
  }
  if (a.category === b.category) {
    return true;
  }
  return memosNearlyEqual(a.memo, b.memo);
}

export function findDuplicateCandidates(entries: LedgerEntry[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const left = entries[i];
      const right = entries[j];
      if (left === undefined || right === undefined) {
        continue;
      }
      if (!isDuplicateCandidate(left, right)) {
        continue;
      }
      const ordered = left.id < right.id ? [left, right] : [right, left];
      const a = ordered[0]!;
      const b = ordered[1]!;
      const reason =
        a.category === b.category ? "同じ日付・金額・カテゴリ" : "同じ日付・金額でメモが近い";
      pairs.push({ leftId: a.id, rightId: b.id, reason });
    }
  }
  return pairs;
}
