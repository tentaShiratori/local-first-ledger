/** 端末 ID を置く localStorage キー。 */
export const DEVICE_ID_STORAGE_KEY = "local-first-ledger:device-id";

/** 同一プロファイル複数タブの書き込みロック名（Web Locks API）。 */
export const TAB_WRITE_LOCK_NAME = "local-first-ledger:writer";

/**
 * Yjs / y-indexeddb の永続化ルーム名の接頭辞。
 * v0.3.0 以降は共有ドキュメント ID を後ろに付ける（端末 ID ではない）。
 */
export const LEDGER_DOC_NAME_PREFIX = "local-first-ledger:entries:";

/** 架空の家族表示名（認証ではない）。 */
export const FAMILY_DISPLAY_NAMES = ["たろう", "はなこ", "じろう"] as const;

export type FamilyDisplayName = (typeof FAMILY_DISPLAY_NAMES)[number];

/** 共有家計簿ドキュメントの永続化名。 */
export function ledgerDocumentName(documentId: string): string {
  return `${LEDGER_DOC_NAME_PREFIX}${documentId}`;
}

/** v0.2.0 互換: 端末ごとの旧ドキュメント名。 */
export function legacyDeviceDocumentName(deviceId: string): string {
  return `${LEDGER_DOC_NAME_PREFIX}${deviceId}`;
}
