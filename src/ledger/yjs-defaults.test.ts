import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";

/**
 * 着手前確認: Yjs 既定動作の観測記録。
 * 親 Map のキー削除と子フィールド編集は別トポロジーであり、
 * 親キー削除は並行する子編集に勝ってエントリが消える。
 * そのため編集優先には墓石+rev を使う（document.ts）。
 */
describe("Yjs default topology observations", () => {
  it("parent key delete removes the entry even when a concurrent nested field edit exists", () => {
    const seed = new Y.Doc();
    const nested = new Y.Map();
    seed.getMap("entries").set("e1", nested);
    nested.set("memo", "seed");
    const seedUpdate = Y.encodeStateAsUpdate(seed);

    const deleter = new Y.Doc();
    deleter.clientID = 1;
    Y.applyUpdate(deleter, seedUpdate);
    const editor = new Y.Doc();
    editor.clientID = 2;
    Y.applyUpdate(editor, seedUpdate);

    deleter.getMap("entries").delete("e1");
    (editor.getMap("entries").get("e1") as Y.Map<unknown>).set("memo", "edited");

    const ab = new Y.Doc();
    Y.applyUpdate(ab, Y.encodeStateAsUpdate(deleter));
    Y.applyUpdate(ab, Y.encodeStateAsUpdate(editor));
    const ba = new Y.Doc();
    Y.applyUpdate(ba, Y.encodeStateAsUpdate(editor));
    Y.applyUpdate(ba, Y.encodeStateAsUpdate(deleter));

    expect(ab.getMap("entries").has("e1")).toBe(false);
    expect(ba.getMap("entries").has("e1")).toBe(false);
  });

  it("nested maps keep concurrent different-key sets", () => {
    const seed = new Y.Doc();
    const nested = new Y.Map();
    seed.getMap("entries").set("e1", nested);
    nested.set("memo", "seed");
    nested.set("amount", 100);
    const seedUpdate = Y.encodeStateAsUpdate(seed);

    const a = new Y.Doc();
    a.clientID = 3;
    Y.applyUpdate(a, seedUpdate);
    const b = new Y.Doc();
    b.clientID = 4;
    Y.applyUpdate(b, seedUpdate);
    (a.getMap("entries").get("e1") as Y.Map<unknown>).set("memo", "A");
    (b.getMap("entries").get("e1") as Y.Map<unknown>).set("amount", 200);

    const merged = new Y.Doc();
    Y.applyUpdate(merged, Y.encodeStateAsUpdate(a));
    Y.applyUpdate(merged, Y.encodeStateAsUpdate(b));
    const entry = merged.getMap("entries").get("e1") as Y.Map<unknown>;
    expect(entry.get("memo")).toBe("A");
    expect(entry.get("amount")).toBe(200);
  });
});
