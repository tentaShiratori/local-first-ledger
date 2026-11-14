import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

import { ledgerDocumentName, legacyDeviceDocumentName } from "./constants.js";
import { migrationFlagKey } from "./document-id.js";
import { createLedgerDocument, listEntries, type LedgerDocument } from "./document.js";

export type LedgerPersistence = {
  ledger: LedgerDocument;
  persistence: IndexeddbPersistence;
  documentName: string;
  documentId: string;
  whenSynced: Promise<void>;
  destroy: () => Promise<void>;
};

export type OpenLedgerPersistenceOptions = {
  documentId: string;
  /** 旧端末別データの移行元。省略時は移行しない。 */
  deviceId?: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
  doc?: Y.Doc;
};

/**
 * 共有ドキュメント ID の Y.Doc を y-indexeddb で永続化する。
 * 公式: IndexeddbPersistence(roomName, ydoc) + whenSynced / synced。
 *
 * 移行: 共有ドキュメントが空で、端末別の旧ルームに明細があるときだけ
 * 1 回 `Y.encodeStateAsUpdate` で取り込む（フラグで再実行しない）。
 */
export function openLedgerPersistence(
  documentIdOrDeviceId: string,
  maybeDoc?: Y.Doc,
): LedgerPersistence;
export function openLedgerPersistence(options: OpenLedgerPersistenceOptions): LedgerPersistence;
export function openLedgerPersistence(
  documentIdOrOptions: string | OpenLedgerPersistenceOptions,
  maybeDoc?: Y.Doc,
): LedgerPersistence {
  const options: OpenLedgerPersistenceOptions =
    typeof documentIdOrOptions === "string"
      ? maybeDoc === undefined
        ? { documentId: documentIdOrOptions }
        : { documentId: documentIdOrOptions, doc: maybeDoc }
      : documentIdOrOptions;

  const ledger = createLedgerDocument(options.doc);
  const documentName = ledgerDocumentName(options.documentId);
  const persistence = new IndexeddbPersistence(documentName, ledger.doc);
  const whenSynced = persistence.whenSynced.then(async () => {
    const migrateArgs: {
      ledger: LedgerDocument;
      documentId: string;
      deviceId?: string;
      storage?: Pick<Storage, "getItem" | "setItem">;
    } = {
      ledger,
      documentId: options.documentId,
    };
    if (options.deviceId !== undefined) {
      migrateArgs.deviceId = options.deviceId;
    }
    if (options.storage !== undefined) {
      migrateArgs.storage = options.storage;
    }
    await maybeMigrateFromLegacyDeviceDoc(migrateArgs);
  });

  return {
    ledger,
    persistence,
    documentName,
    documentId: options.documentId,
    whenSynced,
    destroy: async () => {
      await persistence.destroy();
      ledger.doc.destroy();
    },
  };
}

async function maybeMigrateFromLegacyDeviceDoc(args: {
  ledger: LedgerDocument;
  documentId: string;
  deviceId?: string;
  storage?: Pick<Storage, "getItem" | "setItem">;
}): Promise<void> {
  const { ledger, documentId, deviceId, storage } = args;
  if (deviceId === undefined || storage === undefined) {
    return;
  }
  if (deviceId === documentId) {
    return;
  }
  const flag = migrationFlagKey(documentId);
  if (storage.getItem(flag) === "1") {
    return;
  }
  if (listEntries(ledger).length > 0) {
    storage.setItem(flag, "1");
    return;
  }

  const legacyName = legacyDeviceDocumentName(deviceId);
  if (legacyName === ledgerDocumentName(documentId)) {
    storage.setItem(flag, "1");
    return;
  }

  const legacyDoc = new Y.Doc();
  const legacyPersistence = new IndexeddbPersistence(legacyName, legacyDoc);
  try {
    await legacyPersistence.whenSynced;
    const legacyEntries = createLedgerDocument(legacyDoc);
    if (listEntries(legacyEntries).length === 0) {
      storage.setItem(flag, "1");
      return;
    }
    const update = Y.encodeStateAsUpdate(legacyDoc);
    Y.applyUpdate(ledger.doc, update);
    storage.setItem(flag, "1");
  } finally {
    await legacyPersistence.destroy();
    legacyDoc.destroy();
  }
}
