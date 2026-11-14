import type { LedgerDocument } from "./document.js";

/**
 * カテゴリ予算の PN-Counter（Positive-Negative）。
 * キーは `${category}\0${deviceId}`。各端末は自分のキーだけを増やす。
 * ネスト Y.Map をカテゴリ単位で dual-create すると片方の木が消えるため、平坦マップにする。
 * 読取値は ΣP − ΣN。Yjs コアに Counter が無いための同等実装。
 */

function budgetKey(category: string, deviceId: string): string {
  return `${category}\0${deviceId}`;
}

function parseCategoryFromKey(key: string): string | null {
  const index = key.indexOf("\0");
  if (index <= 0) {
    return null;
  }
  return key.slice(0, index);
}

function sumCategory(
  map: { forEach: (fn: (value: unknown, key: string) => void) => void },
  category: string,
): number {
  let total = 0;
  map.forEach((value, key) => {
    if (parseCategoryFromKey(key) !== category) {
      return;
    }
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      total += value;
    }
  });
  return total;
}

export function adjustCategoryBudget(
  ledger: LedgerDocument,
  category: string,
  deviceId: string,
  delta: number,
): number {
  if (!Number.isInteger(delta) || !Number.isFinite(delta)) {
    throw new Error("budget delta must be a finite integer");
  }
  if (category.length === 0 || category.includes("\0")) {
    throw new Error("category must be non-empty and must not contain NUL");
  }
  if (delta === 0) {
    return readCategoryBudget(ledger, category);
  }
  const key = budgetKey(category, deviceId);
  ledger.doc.transact(() => {
    if (delta > 0) {
      const current = ledger.budgetP.get(key) ?? 0;
      const base = typeof current === "number" ? current : 0;
      ledger.budgetP.set(key, base + delta);
    } else {
      const current = ledger.budgetN.get(key) ?? 0;
      const base = typeof current === "number" ? current : 0;
      ledger.budgetN.set(key, base + -delta);
    }
  });
  return readCategoryBudget(ledger, category);
}

export function readCategoryBudget(ledger: LedgerDocument, category: string): number {
  return sumCategory(ledger.budgetP, category) - sumCategory(ledger.budgetN, category);
}

export function listCategoryBudgets(
  ledger: LedgerDocument,
): Array<{ category: string; amount: number }> {
  const categories = new Set<string>();
  ledger.budgetP.forEach((_value, key) => {
    const category = parseCategoryFromKey(key);
    if (category !== null) {
      categories.add(category);
    }
  });
  ledger.budgetN.forEach((_value, key) => {
    const category = parseCategoryFromKey(key);
    if (category !== null) {
      categories.add(category);
    }
  });
  return [...categories]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((category) => ({ category, amount: readCategoryBudget(ledger, category) }));
}

export function observeBudgets(
  ledger: LedgerDocument,
  listener: (budgets: Array<{ category: string; amount: number }>) => void,
): () => void {
  const handler = () => {
    listener(listCategoryBudgets(ledger));
  };
  ledger.budgetP.observe(handler);
  ledger.budgetN.observe(handler);
  return () => {
    ledger.budgetP.unobserve(handler);
    ledger.budgetN.unobserve(handler);
  };
}
