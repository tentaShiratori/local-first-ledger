import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_SHARED_DOCUMENT_ID, resolveSharedDocumentId } from "./document-id.js";

describe("resolveSharedDocumentId", () => {
  it("uses the default family-demo id", () => {
    expect(resolveSharedDocumentId()).toBe(DEFAULT_SHARED_DOCUMENT_ID);
  });

  it("prefers the doc query parameter and stores it", () => {
    const storage = new Map<string, string>();
    const id = resolveSharedDocumentId({
      searchParams: new URLSearchParams("doc=home-ledger"),
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
      },
    });
    expect(id).toBe("home-ledger");
    expect(storage.get("local-first-ledger:shared-doc-id")).toBe("home-ledger");
  });

  it("rejects unsafe query ids", () => {
    expect(() =>
      resolveSharedDocumentId({ searchParams: new URLSearchParams("doc=../x") }),
    ).toThrow(/invalid/);
  });
});
