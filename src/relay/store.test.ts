import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { createFileUpdateLogStore, createMemoryUpdateLogStore } from "./store.js";

describe("update log store", () => {
  it("appends opaque frames in memory with monotonic seq", async () => {
    const store = createMemoryUpdateLogStore();
    const a = await store.append("family-demo", new Uint8Array([1, 2]));
    const b = await store.append("family-demo", new Uint8Array([3]));
    expect(a).toBe(0);
    expect(b).toBe(1);
    const rows = await store.readFrom("family-demo", 1);
    expect(rows).toHaveLength(1);
    expect(Array.from(rows[0]!.bytes)).toEqual([3]);
    expect(await store.headSeq("family-demo")).toBe(2);
  });

  it("persists frames to a file and survives reopen", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "relay-log-"));
    const first = createFileUpdateLogStore(dir);
    await first.append("family-demo", new Uint8Array([10, 20, 30]));
    await first.append("family-demo", new Uint8Array([40]));

    const second = createFileUpdateLogStore(dir);
    const rows = await second.readFrom("family-demo", 0);
    expect(rows.map((row) => Array.from(row.bytes))).toEqual([[10, 20, 30], [40]]);

    const raw = await readFile(path.join(dir, "family-demo.ylog"));
    // length-prefixed binary only — no JSON ledger fields
    expect(raw.includes(Buffer.from("コンビニ"))).toBe(false);
    expect(raw.includes(Buffer.from("amount"))).toBe(false);
  });

  it("rejects unsafe document ids", async () => {
    const store = createMemoryUpdateLogStore();
    await expect(store.append("../etc", new Uint8Array([1]))).rejects.toThrow(/unsafe/);
  });
});
