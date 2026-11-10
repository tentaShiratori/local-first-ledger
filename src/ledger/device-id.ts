import { DEVICE_ID_STORAGE_KEY } from "./constants.js";

/** localStorage 互換の最小キー値ストア。テスト差し替え用。 */
export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type CreateDeviceId = () => string;

/**
 * 端末（レプリカ）ID を取得する。無ければ発行して保存する。
 * 再起動後も同じ ID を返す。
 */
export function getOrCreateDeviceId(
  store: KeyValueStore,
  createId: CreateDeviceId = () => crypto.randomUUID(),
  storageKey: string = DEVICE_ID_STORAGE_KEY,
): string {
  const existing = store.getItem(storageKey);
  if (existing !== null && existing.length > 0) {
    return existing;
  }
  const created = createId();
  store.setItem(storageKey, created);
  return created;
}
