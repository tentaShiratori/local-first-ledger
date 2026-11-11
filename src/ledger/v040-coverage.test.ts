import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";

import {
  adjustCategoryBudget,
  listCategoryBudgets,
  observeBudgets,
  readCategoryBudget,
} from "./budget.js";
import {
  addEntry,
  createLedgerDocument,
  deleteEntry,
  listEntries,
  migratePlainEntriesToNestedMaps,
  updateEntryFields,
} from "./document.js";
import { findDuplicateCandidates, isDuplicateCandidate } from "./duplicates.js";
import { applyFieldInput, createEntryYMap, readEntryFromYMap } from "./entry-map.js";

describe("v0.4.0 coverage edges", () => {
  it("lists and observes budgets including empty and zero delta", () => {
    const ledger = createLedgerDocument();
    expect(listCategoryBudgets(ledger)).toEqual([]);
    expect(adjustCategoryBudget(ledger, "食費", "d1", 0)).toBe(0);
    adjustCategoryBudget(ledger, "食費", "d1", 40);
    adjustCategoryBudget(ledger, "交通", "d1", -10);
    expect(listCategoryBudgets(ledger)).toEqual([
      { category: "交通", amount: -10 },
      { category: "食費", amount: 40 },
    ]);
    const listener = vi.fn();
    const stop = observeBudgets(ledger, listener);
    adjustCategoryBudget(ledger, "食費", "d1", 5);
    expect(listener).toHaveBeenCalled();
    expect(readCategoryBudget(ledger, "食費")).toBe(45);
    stop();
    expect(() => adjustCategoryBudget(ledger, "", "d1", 1)).toThrow();
    expect(() => adjustCategoryBudget(ledger, "食費", "d1", 1.5)).toThrow();
    expect(() => adjustCategoryBudget(ledger, "a\0b", "d1", 1)).toThrow();
  });

  it("migrates plain entries and supports update/delete on them", () => {
    const ledger = createLedgerDocument();
    ledger.entries.set("plain-1", {
      id: "plain-1",
      date: "2026-11-10",
      amount: 100,
      category: "食費",
      memo: "旧形式",
      enteredBy: "たろう",
    });
    expect(migratePlainEntriesToNestedMaps(ledger, "device-x")).toBe(1);
    expect(migratePlainEntriesToNestedMaps(ledger, "device-x")).toBe(0);
    const updated = updateEntryFields(ledger, "plain-1", { memo: "新" }, "device-x");
    expect(updated.memo).toBe("新");
    deleteEntry(ledger, "plain-1");
    expect(listEntries(ledger)).toHaveLength(0);
  });

  it("covers duplicate memo heuristics", () => {
    expect(
      isDuplicateCandidate(
        {
          id: "1",
          date: "2026-11-10",
          amount: 10,
          category: "A",
          memo: "弁当",
          enteredBy: "たろう",
        },
        {
          id: "2",
          date: "2026-11-10",
          amount: 10,
          category: "B",
          memo: "今日の弁当です",
          enteredBy: "はなこ",
        },
      ),
    ).toBe(true);
    expect(
      isDuplicateCandidate(
        {
          id: "1",
          date: "2026-11-10",
          amount: 10,
          category: "A",
          memo: "x",
          enteredBy: "たろう",
        },
        {
          id: "2",
          date: "2026-11-10",
          amount: 11,
          category: "A",
          memo: "x",
          enteredBy: "はなこ",
        },
      ),
    ).toBe(false);
    expect(
      findDuplicateCandidates([
        {
          id: "b",
          date: "2026-11-10",
          amount: 1,
          category: "食費",
          memo: "",
          enteredBy: "たろう",
        },
        {
          id: "a",
          date: "2026-11-10",
          amount: 1,
          category: "食費",
          memo: "",
          enteredBy: "はなこ",
        },
      ]),
    ).toHaveLength(1);
  });

  it("reads entry maps and applies field patches", () => {
    const doc = new Y.Doc();
    const ledger = createLedgerDocument(doc);
    const map = createEntryYMap(
      {
        id: "id1",
        date: "2026-11-10",
        amount: 1,
        category: "食費",
        memo: "a",
        enteredBy: "たろう",
      },
      "d1",
    );
    ledger.entries.set("id1", map);
    expect(readEntryFromYMap(map)?.memo).toBe("a");
    expect(readEntryFromYMap(null)).toBeNull();
    applyFieldInput(
      map,
      { date: "2026-11-11", amount: 2, category: "日用品", memo: "b", enteredBy: "はなこ" },
      "d1",
    );
    expect(readEntryFromYMap(map)).toMatchObject({
      date: "2026-11-11",
      amount: 2,
      category: "日用品",
      memo: "b",
      enteredBy: "はなこ",
    });
    expect(() => applyFieldInput(map, { amount: 1.2 }, "d1")).toThrow();

    addEntry(
      ledger,
      {
        date: "2026-11-10",
        amount: 3,
        category: "食費",
        memo: "c",
        enteredBy: "じろう",
      },
      "d2",
      () => "x",
    );
    expect(() => updateEntryFields(ledger, "missing", { memo: "z" }, "d2")).toThrow();
    deleteEntry(ledger, "missing");
  });
});
