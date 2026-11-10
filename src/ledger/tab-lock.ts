import { TAB_WRITE_LOCK_NAME } from "./constants.js";

export type TabRole = "writer" | "follower";

export type LockHandle = {
  name: string;
};

/**
 * Web Locks API の request 相当。
 * ブラウザでは navigator.locks.request を渡す。
 */
export type RequestLock = (
  name: string,
  options: { mode?: "exclusive" | "shared"; ifAvailable?: boolean },
  callback: (lock: LockHandle | null) => Promise<void>,
) => Promise<unknown>;

export type WriterLockSession = {
  role: TabRole;
  /** writer のとき、タブ終了や明示解放で呼ぶ。follower では no-op。 */
  release: () => void;
};

/**
 * 同一プロファイルで書き込めるタブを 1 つに限る。
 * ロックを取れないタブは follower（閲覧のみ・警告表示）。
 */
export function acquireWriterLock(options: {
  requestLock: RequestLock;
  signal?: AbortSignal;
  lockName?: string;
}): Promise<WriterLockSession> {
  const lockName = options.lockName ?? TAB_WRITE_LOCK_NAME;
  const signal = options.signal;

  return new Promise<WriterLockSession>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
      return;
    }

    let settleRelease: (() => void) | undefined;
    const held = new Promise<void>((releaseHeld) => {
      settleRelease = releaseHeld;
    });

    const onAbort = () => {
      settleRelease?.();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    void options
      .requestLock(lockName, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        if (lock === null) {
          signal?.removeEventListener("abort", onAbort);
          resolve({
            role: "follower",
            release: () => {
              // follower はロックを持たない
            },
          });
          return;
        }

        resolve({
          role: "writer",
          release: () => {
            settleRelease?.();
          },
        });

        try {
          await held;
        } finally {
          signal?.removeEventListener("abort", onAbort);
        }
      })
      .catch((error: unknown) => {
        signal?.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

/** ブラウザの navigator.locks.request を RequestLock に合わせる。 */
export function browserRequestLock(): RequestLock {
  const locks = globalThis.navigator?.locks;
  if (locks === undefined) {
    throw new Error("Web Locks API is not available");
  }
  return (name, options, callback) => locks.request(name, options, callback);
}
