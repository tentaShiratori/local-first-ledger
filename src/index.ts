/**
 * local-first-ledger の公開 API。
 * v0.1.0: 自作 G-Counter / 後勝ちレジスタ（ライブラリなし）。
 * v0.2.0: Yjs 明細ドキュメント・端末 ID・複数タブ・永続化。
 * v0.3.0: 中継サーバー経由の差分同期（opaque 更新ログ）。
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
  legacyDeviceDocumentName,
  DEFAULT_SHARED_DOCUMENT_ID,
  DOC_MIGRATION_FLAG_PREFIX,
  SHARED_DOCUMENT_ID_STORAGE_KEY,
  migrationFlagKey,
  resolveSharedDocumentId,
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
  createLocalStorageOutboundQueue,
  createLocalStorageSyncCursor,
  createMemoryOutboundQueue,
  createMemorySyncCursor,
  outboundQueueStorageKey,
  syncCursorStorageKey,
  RELAY_UPDATE_ORIGIN,
  createLedgerSyncClient,
  resolveRelayUrl,
  acquireWriterLock,
  browserRequestLock,
  type FamilyDisplayName,
  type DocumentIdSource,
  type CreateDeviceId,
  type KeyValueStore,
  type CreateEntryId,
  type LedgerEntry,
  type NewLedgerEntryInput,
  type LedgerDocument,
  type LedgerPersistence,
  type OpenLedgerPersistenceOptions,
  type OutboundQueueStore,
  type QueuedUpdate,
  type SyncCursorStore,
  type LedgerSyncClient,
  type LedgerSyncClientOptions,
  type SyncStatus,
  type WebSocketFactory,
  type WebSocketLike,
  type LockHandle,
  type RequestLock,
  type TabRole,
  type WriterLockSession,
} from "./ledger/index.js";

export {
  startRelayServer,
  createFileUpdateLogStore,
  createMemoryUpdateLogStore,
  assertSafeDocId,
  base64ToBytes,
  bytesToBase64,
  encodeClientMessage,
  encodeServerMessage,
  parseClientMessage,
  parseServerMessage,
  type RelayServer,
  type RelayServerOptions,
  type UpdateLogStore,
  type StoredEntry,
  type ClientToServerMessage,
  type ServerToClientMessage,
} from "./relay/index.js";
