import { describe, expect, it } from "vite-plus/test";

import { addEntry, createLedgerDocument, listEntries } from "./document.js";
import { findDuplicateCandidates, isDuplicateCandidate } from "./duplicates.js";

describe("duplicate candidates", () => {
  it("flags similar separate entries without deleting them", () => {
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
      "device-a",
      () => "dup-1",
    );
    addEntry(
      ledger,
      {
        date: "2026-11-10",
        amount: 680,
        category: "食費",
        memo: "コンビニの弁当",
        enteredBy: "はなこ",
      },
      "device-b",
      () => "dup-2",
    );

    const entries = listEntries(ledger);
    expect(entries).toHaveLength(2);
    const pairs = findDuplicateCandidates(entries);
    expect(pairs).toHaveLength(1);
    expect(listEntries(ledger)).toHaveLength(2);
  });

  it("does not flag unrelated entries", () => {
    expect(
      isDuplicateCandidate(
        {
          id: "a",
          date: "2026-11-10",
          amount: 680,
          category: "食費",
          memo: "弁当",
          enteredBy: "たろう",
        },
        {
          id: "b",
          date: "2026-11-11",
          amount: 680,
          category: "食費",
          memo: "弁当",
          enteredBy: "はなこ",
        },
      ),
    ).toBe(false);
  });
});
