import "fake-indexeddb/auto";

import { describe, expect, it } from "vite-plus/test";

import { addEntry, listEntries } from "./document.js";
import { migrationFlagKey } from "./document-id.js";
import { openLedgerPersistence } from "./persistence.js";

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

describe("openLedgerPersistence migration", () => {
  it("copies legacy device-scoped entries into an empty shared document once", async () => {
    const storage = memoryStorage();
    const deviceId = "migrate-device-a";
    const documentId = "shared-migrate-a";
    const legacy = openLedgerPersistence(deviceId);
    await legacy.whenSynced;
    addEntry(
      legacy.ledger,
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "移行前の弁当",
        enteredBy: "たろう",
      },
      deviceId,
      () => "legacy-1",
    );
    await legacy.persistence.whenSynced;
    await new Promise((resolve) => setTimeout(resolve, 50));
    await legacy.destroy();

    const shared = openLedgerPersistence({
      documentId,
      deviceId,
      storage,
    });
    await shared.whenSynced;
    const entries = listEntries(shared.ledger);
    expect(entries.some((entry) => entry.memo === "移行前の弁当")).toBe(true);
    expect(storage.getItem(migrationFlagKey(documentId))).toBe("1");
    await shared.destroy();

    const again = openLedgerPersistence({
      documentId,
      deviceId,
      storage,
    });
    await again.whenSynced;
    expect(listEntries(again.ledger).filter((entry) => entry.memo === "移行前の弁当")).toHaveLength(
      1,
    );
    await again.destroy();
  });

  it("skips migration when deviceId equals documentId or flag is set", async () => {
    const storage = memoryStorage();
    const documentId = "shared-migrate-skip";
    storage.setItem(migrationFlagKey(documentId), "1");
    const skipped = openLedgerPersistence({
      documentId,
      deviceId: "other-device-skip",
      storage,
    });
    await skipped.whenSynced;
    expect(listEntries(skipped.ledger)).toHaveLength(0);
    await skipped.destroy();

    const same = openLedgerPersistence({
      documentId: "same-id-migrate",
      deviceId: "same-id-migrate",
      storage: memoryStorage(),
    });
    await same.whenSynced;
    await same.destroy();
  });

  it("accepts an explicit Y.Doc via the string overload", async () => {
    const { Doc } = await import("yjs");
    const doc = new Doc();
    const opened = openLedgerPersistence("explicit-doc", doc);
    await opened.whenSynced;
    expect(opened.documentId).toBe("explicit-doc");
    await opened.destroy();
  });
});
