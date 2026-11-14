import "fake-indexeddb/auto";

import { describe, expect, it } from "vite-plus/test";

import { addEntry, listEntries } from "./document.js";
import { openLedgerPersistence } from "./persistence.js";

describe("openLedgerPersistence", () => {
  it("restores entries after destroy and reopen (IndexedDB)", async () => {
    const deviceId = "persist-device-1";
    const first = openLedgerPersistence(deviceId);
    await first.whenSynced;
    addEntry(
      first.ledger,
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      deviceId,
      () => "persist-e1",
    );
    // y-indexeddb stores updates asynchronously with a short timeout; force a sync wait.
    await first.persistence.whenSynced;
    await new Promise((resolve) => setTimeout(resolve, 50));
    await first.destroy();

    const second = openLedgerPersistence(deviceId);
    await second.whenSynced;
    const entries = listEntries(second.ledger);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "persist-device-1:persist-e1",
      memo: "コンビニ弁当",
      amount: 680,
      enteredBy: "たろう",
    });
    await second.destroy();
  });
});
