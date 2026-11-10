import { describe, expect, it } from "vite-plus/test";

import {
  acquireWriterLock,
  browserRequestLock,
  type LockHandle,
  type RequestLock,
} from "./tab-lock.js";

function createFakeLockManager(): {
  requestLock: RequestLock;
} {
  let held = false;

  const requestLock: RequestLock = async (_name, options, callback) => {
    if (options.ifAvailable && held) {
      await callback(null);
      return;
    }

    held = true;
    const handle: LockHandle = { name: _name };
    try {
      await callback(handle);
    } finally {
      held = false;
    }
  };

  return { requestLock };
}

describe("acquireWriterLock", () => {
  it("grants writer to the first tab and follower to the second while the lock is held", async () => {
    const locks = createFakeLockManager();
    const first = await acquireWriterLock({ requestLock: locks.requestLock });
    expect(first.role).toBe("writer");

    const second = await acquireWriterLock({ requestLock: locks.requestLock });
    expect(second.role).toBe("follower");
    second.release();

    first.release();
  });

  it("rejects when the abort signal is already aborted", async () => {
    const locks = createFakeLockManager();
    const signal = AbortSignal.abort(new Error("already done"));
    await expect(acquireWriterLock({ requestLock: locks.requestLock, signal })).rejects.toThrow(
      "already done",
    );
  });

  it("rejects non-Error abort reasons as Error", async () => {
    const locks = createFakeLockManager();
    const signal = AbortSignal.abort("stop");
    await expect(acquireWriterLock({ requestLock: locks.requestLock, signal })).rejects.toThrow(
      "aborted",
    );
  });

  it("rejects when requestLock fails", async () => {
    const requestLock: RequestLock = async () => {
      throw new Error("lock broken");
    };
    await expect(acquireWriterLock({ requestLock })).rejects.toThrow("lock broken");
  });

  it("rejects non-Error requestLock failures", async () => {
    const requestLock: RequestLock = async () => {
      throw "boom";
    };
    await expect(acquireWriterLock({ requestLock })).rejects.toThrow("boom");
  });

  it("releases the writer when the abort signal fires", async () => {
    const locks = createFakeLockManager();
    const controller = new AbortController();
    const first = await acquireWriterLock({
      requestLock: locks.requestLock,
      signal: controller.signal,
    });
    expect(first.role).toBe("writer");
    controller.abort();
    await Promise.resolve();
    await Promise.resolve();

    const next = await acquireWriterLock({ requestLock: locks.requestLock });
    expect(next.role).toBe("writer");
    next.release();
  });
});

describe("browserRequestLock", () => {
  it("throws when Web Locks API is missing", () => {
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: undefined,
    });
    try {
      expect(() => browserRequestLock()).toThrow(/Web Locks API/);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: original,
      });
    }
  });

  it("wraps navigator.locks.request when available", async () => {
    const calls: unknown[] = [];
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        locks: {
          request: async (
            name: string,
            options: object,
            callback: (lock: LockHandle | null) => Promise<void>,
          ) => {
            calls.push({ name, options });
            await callback({ name });
          },
        },
      },
    });
    try {
      const requestLock = browserRequestLock();
      await requestLock("lock-a", { ifAvailable: true }, async () => undefined);
      expect(calls).toEqual([{ name: "lock-a", options: { ifAvailable: true } }]);
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: original,
      });
    }
  });
});
