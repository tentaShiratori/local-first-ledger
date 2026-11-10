import { IndexeddbPersistence } from "y-indexeddb";
import type * as Y from "yjs";

import { ledgerDocumentName } from "./constants.js";
import { createLedgerDocument, type LedgerDocument } from "./document.js";

export type LedgerPersistence = {
  ledger: LedgerDocument;
  persistence: IndexeddbPersistence;
  documentName: string;
  whenSynced: Promise<void>;
  destroy: () => Promise<void>;
};

/**
 * 端末ごとの Y.Doc を y-indexeddb で永続化する。
 * 公式: IndexeddbPersistence(roomName, ydoc) + whenSynced / synced。
 */
export function openLedgerPersistence(deviceId: string, doc?: Y.Doc): LedgerPersistence {
  const ledger = createLedgerDocument(doc);
  const documentName = ledgerDocumentName(deviceId);
  const persistence = new IndexeddbPersistence(documentName, ledger.doc);
  const whenSynced = persistence.whenSynced.then(() => undefined);

  return {
    ledger,
    persistence,
    documentName,
    whenSynced,
    destroy: async () => {
      await persistence.destroy();
      ledger.doc.destroy();
    },
  };
}
