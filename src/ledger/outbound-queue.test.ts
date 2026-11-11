import { describe, expect, it } from "vite-plus/test";

import {
  createLocalStorageOutboundQueue,
  createLocalStorageSyncCursor,
  createMemoryOutboundQueue,
} from "./outbound-queue.js";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.get(key) ?? null;
    },
    key() {
      return null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(key, value);
    },
  } as Storage;
}

describe("outbound queue and cursor", () => {
  it("keeps pending updates until removed", async () => {
    const queue = createMemoryOutboundQueue();
    const id = await queue.enqueue(new Uint8Array([1, 2, 3]), "m1");
    expect(id).toBe("m1");
    expect((await queue.list())[0]?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    await queue.remove("m1");
    expect(await queue.list()).toEqual([]);
  });

  it("persists queue and cursor in storage", async () => {
    const storage = memoryStorage();
    const queue = createLocalStorageOutboundQueue(storage, "q");
    await queue.enqueue(new Uint8Array([9]), "x");
    const reloaded = createLocalStorageOutboundQueue(storage, "q");
    expect((await reloaded.list())[0]?.id).toBe("x");

    const cursor = createLocalStorageSyncCursor(storage, "c");
    await cursor.setFromSeq(4);
    expect(await createLocalStorageSyncCursor(storage, "c").getFromSeq()).toBe(4);
  });
});
