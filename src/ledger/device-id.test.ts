import { describe, expect, it } from "vite-plus/test";

import { DEVICE_ID_STORAGE_KEY } from "./constants.js";
import { getOrCreateDeviceId, type KeyValueStore } from "./device-id.js";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

describe("getOrCreateDeviceId", () => {
  it("issues and stores a new device id when missing", () => {
    const store = memoryStore();
    const id = getOrCreateDeviceId(store, () => "device-alpha");
    expect(id).toBe("device-alpha");
    expect(store.getItem(DEVICE_ID_STORAGE_KEY)).toBe("device-alpha");
  });

  it("returns the same id after a restart-like store reuse", () => {
    const store = memoryStore();
    const first = getOrCreateDeviceId(store, () => "device-beta");
    const second = getOrCreateDeviceId(store, () => "should-not-be-used");
    expect(first).toBe("device-beta");
    expect(second).toBe("device-beta");
  });

  it("reissues when the stored value is empty", () => {
    const store = memoryStore({ [DEVICE_ID_STORAGE_KEY]: "" });
    const id = getOrCreateDeviceId(store, () => "device-gamma");
    expect(id).toBe("device-gamma");
  });
});
