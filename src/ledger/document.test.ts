import { describe, expect, it, vi } from "vite-plus/test";

import { addEntry, createLedgerDocument, listEntries, observeEntries } from "./document.js";

describe("ledger document", () => {
  it("adds and lists entries from the Y.Map", () => {
    const ledger = createLedgerDocument();
    addEntry(
      ledger,
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      "device-1",
      () => "e1",
    );
    addEntry(
      ledger,
      {
        date: "2026-11-09",
        amount: 120,
        category: "交通",
        memo: "バス",
        enteredBy: "はなこ",
      },
      "device-1",
      () => "e2",
    );

    const listed = listEntries(ledger);
    expect(listed).toHaveLength(2);
    expect(listed[0]?.date).toBe("2026-11-10");
    expect(listed[1]?.memo).toBe("バス");
  });

  it("sorts same-date entries by id descending and skips invalid values", () => {
    const ledger = createLedgerDocument();
    ledger.entries.set("bad", { not: "an-entry" } as never);
    addEntry(
      ledger,
      {
        date: "2026-11-10",
        amount: 100,
        category: "日用品",
        memo: "a",
        enteredBy: "たろう",
      },
      "device-1",
      () => "id-a",
    );
    addEntry(
      ledger,
      {
        date: "2026-11-10",
        amount: 200,
        category: "日用品",
        memo: "b",
        enteredBy: "たろう",
      },
      "device-1",
      () => "id-b",
    );

    const listed = listEntries(ledger);
    expect(listed).toHaveLength(2);
    expect(listed[0]?.id).toBe("device-1:id-b");
    expect(listed[1]?.id).toBe("device-1:id-a");
  });

  it("observes entry changes until unsubscribed", () => {
    const ledger = createLedgerDocument();
    const listener = vi.fn();
    const stop = observeEntries(ledger, listener);

    addEntry(
      ledger,
      {
        date: "2026-11-10",
        amount: 50,
        category: "食費",
        memo: "お茶",
        enteredBy: "じろう",
      },
      "device-1",
      () => "tea",
    );
    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls.at(-1)?.[0]?.[0]?.memo).toBe("お茶");

    stop();
    addEntry(
      ledger,
      {
        date: "2026-11-10",
        amount: 60,
        category: "食費",
        memo: "パン",
        enteredBy: "じろう",
      },
      "device-1",
      () => "bread",
    );
    const callsAfterStop = listener.mock.calls.length;
    expect(listener.mock.calls.length).toBe(callsAfterStop);
  });
});
