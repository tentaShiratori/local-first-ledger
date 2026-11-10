import * as Y from "yjs";

import { isLedgerEntry, type LedgerEntry, type NewLedgerEntryInput } from "./entry.js";
import { createEntryId, createLedgerEntry } from "./entry.js";

export const ENTRIES_MAP_KEY = "entries";

export type LedgerDocument = {
  doc: Y.Doc;
  entries: Y.Map<LedgerEntry>;
};

export function createLedgerDocument(doc: Y.Doc = new Y.Doc()): LedgerDocument {
  const entries = doc.getMap<LedgerEntry>(ENTRIES_MAP_KEY);
  return { doc, entries };
}

export function listEntries(ledger: LedgerDocument): LedgerEntry[] {
  const result: LedgerEntry[] = [];
  ledger.entries.forEach((value) => {
    if (isLedgerEntry(value)) {
      result.push(value);
    }
  });
  return result.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

export function addEntry(
  ledger: LedgerDocument,
  input: NewLedgerEntryInput,
  deviceId: string,
  randomUUID: () => string = () => crypto.randomUUID(),
): LedgerEntry {
  const entry = createLedgerEntry(input, () => createEntryId(deviceId, randomUUID));
  ledger.doc.transact(() => {
    ledger.entries.set(entry.id, entry);
  });
  return entry;
}

export function observeEntries(
  ledger: LedgerDocument,
  listener: (entries: LedgerEntry[]) => void,
): () => void {
  const handler = () => {
    listener(listEntries(ledger));
  };
  ledger.entries.observe(handler);
  return () => {
    ledger.entries.unobserve(handler);
  };
}
