import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";

import { adjustCategoryBudget, readCategoryBudget } from "./budget.js";
import { createLedgerDocument } from "./document.js";

describe("category budget PN-Counter", () => {
  it("adds concurrent increments from two replicas to 150", () => {
    const seed = createLedgerDocument();
    const base = Y.encodeStateAsUpdate(seed.doc);
    const a = new Y.Doc();
    a.clientID = 1;
    Y.applyUpdate(a, base);
    const b = new Y.Doc();
    b.clientID = 2;
    Y.applyUpdate(b, base);

    adjustCategoryBudget(createLedgerDocument(a), "食費", "device-a", 100);
    adjustCategoryBudget(createLedgerDocument(b), "食費", "device-b", 50);

    const merged = new Y.Doc();
    Y.applyUpdate(merged, Y.encodeStateAsUpdate(a));
    Y.applyUpdate(merged, Y.encodeStateAsUpdate(b));
    expect(readCategoryBudget(createLedgerDocument(merged), "食費")).toBe(150);

    const swapped = new Y.Doc();
    Y.applyUpdate(swapped, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(swapped, Y.encodeStateAsUpdate(a));
    expect(readCategoryBudget(createLedgerDocument(swapped), "食費")).toBe(150);
  });

  it("applies concurrent +100 and -30 to reach 70", () => {
    const seed = createLedgerDocument();
    const base = Y.encodeStateAsUpdate(seed.doc);
    const a = new Y.Doc();
    Y.applyUpdate(a, base);
    const b = new Y.Doc();
    Y.applyUpdate(b, base);

    adjustCategoryBudget(createLedgerDocument(a), "食費", "device-a", 100);
    adjustCategoryBudget(createLedgerDocument(b), "食費", "device-b", -30);

    const orders = [
      [Y.encodeStateAsUpdate(a), Y.encodeStateAsUpdate(b)],
      [Y.encodeStateAsUpdate(b), Y.encodeStateAsUpdate(a)],
      [Y.encodeStateAsUpdate(a), Y.encodeStateAsUpdate(a), Y.encodeStateAsUpdate(b)],
    ];
    for (const order of orders) {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, base);
      for (const update of order) {
        Y.applyUpdate(doc, update);
      }
      expect(readCategoryBudget(createLedgerDocument(doc), "食費")).toBe(70);
    }
  });
});
