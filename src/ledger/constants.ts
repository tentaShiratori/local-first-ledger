/** 端末 ID を置く localStorage キー。 */
export const DEVICE_ID_STORAGE_KEY = "local-first-ledger:device-id";

/** 同一プロファイル複数タブの書き込みロック名（Web Locks API）。 */
export const TAB_WRITE_LOCK_NAME = "local-first-ledger:writer";

/** Yjs / y-indexeddb の永続化ルーム名の接頭辞。端末 ID を後ろに付ける。 */
export const LEDGER_DOC_NAME_PREFIX = "local-first-ledger:entries:";

/** 架空の家族表示名（認証ではない）。 */
export const FAMILY_DISPLAY_NAMES = ["たろう", "はなこ", "じろう"] as const;

export type FamilyDisplayName = (typeof FAMILY_DISPLAY_NAMES)[number];

export function ledgerDocumentName(deviceId: string): string {
  return `${LEDGER_DOC_NAME_PREFIX}${deviceId}`;
}
