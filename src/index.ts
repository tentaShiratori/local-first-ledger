/**
 * local-first-ledger の公開 API。
 * v0.1.0: 自作 G-Counter / 後勝ちレジスタ（ライブラリなし）。
 * v0.2.0: Yjs 明細ドキュメント・端末 ID・複数タブ・永続化。
 */

export { environmentReadyMarker } from "./env-marker.js";

export {
  createGCounter,
  incrementGCounter,
  valueGCounter,
  mergeGCounter,
  equalsGCounter,
  type ReplicaId,
  type GCounterState,
} from "./g-counter.js";

export {
  createLwwRegister,
  writeLwwRegister,
  valueLwwRegister,
  mergeLwwRegister,
  equalsLwwRegister,
  compareStamps,
  type Stamp,
  type LwwRegisterState,
} from "./lww-register.js";

export { createPrng, type Prng } from "./prng.js";

export {
  DEVICE_ID_STORAGE_KEY,
  FAMILY_DISPLAY_NAMES,
  LEDGER_DOC_NAME_PREFIX,
  TAB_WRITE_LOCK_NAME,
  ledgerDocumentName,
  getOrCreateDeviceId,
  createEntryId,
  createLedgerEntry,
  isLedgerEntry,
  ENTRIES_MAP_KEY,
  addEntry,
  createLedgerDocument,
  listEntries,
  observeEntries,
  openLedgerPersistence,
  acquireWriterLock,
  browserRequestLock,
  type FamilyDisplayName,
  type CreateDeviceId,
  type KeyValueStore,
  type CreateEntryId,
  type LedgerEntry,
  type NewLedgerEntryInput,
  type LedgerDocument,
  type LedgerPersistence,
  type LockHandle,
  type RequestLock,
  type TabRole,
  type WriterLockSession,
} from "./ledger/index.js";
