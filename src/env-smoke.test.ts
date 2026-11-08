import { describe, expect, it } from "vitest";
import { environmentReadyMarker } from "./index.js";

/**
 * 環境確認用スモークテスト。
 * CRDT の収束・冪等・ブラウザ同期を検証するものではない。
 */
describe("environment smoke", () => {
  it("loads a TypeScript module and returns the env marker", () => {
    expect(environmentReadyMarker()).toBe("local-first-ledger:env-ok");
  });

  it("runs under the expected ECMAScript runtime basics", () => {
    const values = [1, 2, 3];
    expect(values.reduce((sum, n) => sum + n, 0)).toBe(6);
  });
});
