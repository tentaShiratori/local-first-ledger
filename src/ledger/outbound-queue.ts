import { base64ToBytes, bytesToBase64 } from "../relay/protocol.js";

export type QueuedUpdate = {
  id: string;
  bytes: Uint8Array;
};

export type OutboundQueueStore = {
  list(): Promise<QueuedUpdate[]>;
  enqueue(bytes: Uint8Array, id?: string): Promise<string>;
  remove(id: string): Promise<void>;
};

type StoredRow = {
  id: string;
  updateBase64: string;
};

function parseRows(raw: string | null): StoredRow[] {
  if (raw === null || raw === "") {
    return [];
  }
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: StoredRow[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.updateBase64 !== "string") {
      continue;
    }
    rows.push({ id: record.id, updateBase64: record.updateBase64 });
  }
  return rows;
}

/** メモリ上の未送信キュー（テスト用）。 */
export function createMemoryOutboundQueue(): OutboundQueueStore {
  const items: QueuedUpdate[] = [];
  return {
    async list() {
      return items.map((item) => ({ id: item.id, bytes: item.bytes.slice() }));
    },
    async enqueue(bytes, id = crypto.randomUUID()) {
      items.push({ id, bytes: bytes.slice() });
      return id;
    },
    async remove(id) {
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) {
        items.splice(index, 1);
      }
    },
  };
}

/** localStorage に base64 で未送信更新を永続化する。 */
export function createLocalStorageOutboundQueue(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  storageKey: string,
): OutboundQueueStore {
  const read = (): StoredRow[] => parseRows(storage.getItem(storageKey));
  const write = (rows: StoredRow[]): void => {
    if (rows.length === 0) {
      storage.removeItem(storageKey);
      return;
    }
    storage.setItem(storageKey, JSON.stringify(rows));
  };

  return {
    async list() {
      return read().map((row) => ({ id: row.id, bytes: base64ToBytes(row.updateBase64) }));
    },
    async enqueue(bytes, id = crypto.randomUUID()) {
      const rows = read();
      rows.push({ id, updateBase64: bytesToBase64(bytes) });
      write(rows);
      return id;
    },
    async remove(id) {
      write(read().filter((row) => row.id !== id));
    },
  };
}

export function outboundQueueStorageKey(docId: string): string {
  return `local-first-ledger:outbound:${docId}`;
}

export function syncCursorStorageKey(docId: string): string {
  return `local-first-ledger:sync-cursor:${docId}`;
}

export type SyncCursorStore = {
  getFromSeq(): Promise<number>;
  setFromSeq(seq: number): Promise<void>;
};

export function createMemorySyncCursor(initial = 0): SyncCursorStore {
  let fromSeq = initial;
  return {
    async getFromSeq() {
      return fromSeq;
    },
    async setFromSeq(seq) {
      fromSeq = seq;
    },
  };
}

export function createLocalStorageSyncCursor(
  storage: Pick<Storage, "getItem" | "setItem">,
  storageKey: string,
): SyncCursorStore {
  return {
    async getFromSeq() {
      const raw = storage.getItem(storageKey);
      if (raw === null || raw === "") {
        return 0;
      }
      const value = Number(raw);
      return Number.isInteger(value) && value >= 0 ? value : 0;
    },
    async setFromSeq(seq) {
      storage.setItem(storageKey, String(seq));
    },
  };
}
