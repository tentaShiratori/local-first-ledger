import { describe, expect, it } from "vite-plus/test";

import { createEntryId, createLedgerEntry, isLedgerEntry } from "./entry.js";

describe("ledger entry", () => {
  it("creates an entry with device-issued id", () => {
    const entry = createLedgerEntry(
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニ弁当",
        enteredBy: "たろう",
      },
      () => "dev-1:entry-1",
    );
    expect(entry).toEqual({
      id: "dev-1:entry-1",
      date: "2026-11-10",
      amount: 680,
      category: "食費",
      memo: "コンビニ弁当",
      enteredBy: "たろう",
    });
  });

  it("rejects non-integer amounts", () => {
    expect(() =>
      createLedgerEntry(
        {
          date: "2026-11-10",
          amount: 12.5,
          category: "食費",
          memo: "x",
          enteredBy: "たろう",
        },
        () => "id",
      ),
    ).toThrow(/integer/);
  });

  it("builds stable-looking ids from device id and uuid", () => {
    expect(createEntryId("dev-9", () => "uuid-1")).toBe("dev-9:uuid-1");
  });

  it("type-guards ledger entries", () => {
    expect(
      isLedgerEntry({
        id: "a",
        date: "2026-11-10",
        amount: 100,
        category: "日用品",
        memo: "",
        enteredBy: "はなこ",
      }),
    ).toBe(true);
    expect(isLedgerEntry({ id: "a" })).toBe(false);
    expect(isLedgerEntry(null)).toBe(false);
    expect(isLedgerEntry("x")).toBe(false);
    expect(
      isLedgerEntry({
        id: "a",
        date: "2026-11-10",
        amount: Number.NaN,
        category: "日用品",
        memo: "",
        enteredBy: "はなこ",
      }),
    ).toBe(false);
  });

  it("uses crypto.randomUUID by default when creating ids", () => {
    const id = createEntryId("dev-z");
    expect(id.startsWith("dev-z:")).toBe(true);
    expect(id.length).toBeGreaterThan("dev-z:".length);
  });
});
