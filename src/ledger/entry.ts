/**
 * 明細の最小フィールド（要件 1）。
 * 正規の保存先は CRDT ドキュメント。合計・残高は持たない。
 */
export type LedgerEntry = {
  id: string;
  date: string;
  amount: number;
  category: string;
  memo: string;
  enteredBy: string;
};

export type NewLedgerEntryInput = {
  date: string;
  amount: number;
  category: string;
  memo: string;
  enteredBy: string;
};

export type CreateEntryId = () => string;

/** 端末が発行する明細 ID。 */
export function createEntryId(
  deviceId: string,
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  return `${deviceId}:${randomUUID()}`;
}

export function createLedgerEntry(
  input: NewLedgerEntryInput,
  createId: CreateEntryId,
): LedgerEntry {
  const amount = input.amount;
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new Error("amount must be a finite integer");
  }
  return {
    id: createId(),
    date: input.date,
    amount,
    category: input.category,
    memo: input.memo,
    enteredBy: input.enteredBy,
  };
}

export function isLedgerEntry(value: unknown): value is LedgerEntry {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.date === "string" &&
    typeof record.amount === "number" &&
    Number.isFinite(record.amount) &&
    Number.isInteger(record.amount) &&
    typeof record.category === "string" &&
    typeof record.memo === "string" &&
    typeof record.enteredBy === "string"
  );
}
