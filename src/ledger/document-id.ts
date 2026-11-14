/** 学習用の既定共有ドキュメント ID。家族で 1 つの家計簿を共有する。 */
export const DEFAULT_SHARED_DOCUMENT_ID = "family-demo";

/** 共有ドキュメント ID を置く localStorage キー。 */
export const SHARED_DOCUMENT_ID_STORAGE_KEY = "local-first-ledger:shared-doc-id";

/** 端末別ドキュメントから共有ドキュメントへの移行完了フラグ接頭辞。 */
export const DOC_MIGRATION_FLAG_PREFIX = "local-first-ledger:migrated-to:";

const DOC_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type DocumentIdSource = {
  searchParams?: URLSearchParams;
  storage?: Pick<Storage, "getItem" | "setItem">;
  defaultId?: string;
};

/**
 * 共有ドキュメント ID を決める。
 * 優先順: URL `?doc=` → localStorage → 既定 `family-demo`。
 * 端末 ID はレプリカ識別に残し、ドキュメント名には使わない。
 */
export function resolveSharedDocumentId(source: DocumentIdSource = {}): string {
  const fallback = source.defaultId ?? DEFAULT_SHARED_DOCUMENT_ID;
  const fromQuery = source.searchParams?.get("doc")?.trim();
  if (fromQuery !== undefined && fromQuery.length > 0) {
    if (!DOC_ID_PATTERN.test(fromQuery)) {
      throw new Error(`invalid doc id in query: ${fromQuery}`);
    }
    source.storage?.setItem(SHARED_DOCUMENT_ID_STORAGE_KEY, fromQuery);
    return fromQuery;
  }
  const fromStorage = source.storage?.getItem(SHARED_DOCUMENT_ID_STORAGE_KEY);
  if (fromStorage !== null && fromStorage !== undefined && fromStorage.length > 0) {
    if (!DOC_ID_PATTERN.test(fromStorage)) {
      return fallback;
    }
    return fromStorage;
  }
  source.storage?.setItem(SHARED_DOCUMENT_ID_STORAGE_KEY, fallback);
  return fallback;
}

export function migrationFlagKey(docId: string): string {
  return `${DOC_MIGRATION_FLAG_PREFIX}${docId}`;
}
