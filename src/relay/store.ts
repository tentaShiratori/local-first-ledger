import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

export type StoredEntry = {
  seq: number;
  bytes: Uint8Array;
};

/**
 * ドキュメント ID ごとの opaque 更新バイト列の追記ログ。
 * Yjs を import しない。中身をデコードしない。
 */
export type UpdateLogStore = {
  append(docId: string, bytes: Uint8Array): Promise<number>;
  readFrom(docId: string, fromSeq: number): Promise<StoredEntry[]>;
  headSeq(docId: string): Promise<number>;
};

const DOC_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function assertSafeDocId(docId: string): void {
  if (!DOC_ID_PATTERN.test(docId)) {
    throw new Error(`unsafe docId: ${docId}`);
  }
}

function frame(bytes: Uint8Array): Uint8Array {
  const header = new Uint8Array(4);
  const view = new DataView(header.buffer);
  view.setUint32(0, bytes.byteLength, false);
  const out = new Uint8Array(4 + bytes.byteLength);
  out.set(header, 0);
  out.set(bytes, 4);
  return out;
}

function parseFrames(buffer: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  let offset = 0;
  while (offset + 4 <= buffer.byteLength) {
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
    const length = view.getUint32(0, false);
    offset += 4;
    if (offset + length > buffer.byteLength) {
      throw new Error("corrupt update log: truncated frame");
    }
    frames.push(buffer.slice(offset, offset + length));
    offset += length;
  }
  if (offset !== buffer.byteLength) {
    throw new Error("corrupt update log: trailing bytes");
  }
  return frames;
}

export function createMemoryUpdateLogStore(): UpdateLogStore {
  const logs = new Map<string, Uint8Array[]>();

  return {
    async append(docId, bytes) {
      assertSafeDocId(docId);
      const list = logs.get(docId) ?? [];
      const seq = list.length;
      list.push(bytes.slice());
      logs.set(docId, list);
      return seq;
    },
    async readFrom(docId, fromSeq) {
      assertSafeDocId(docId);
      const list = logs.get(docId) ?? [];
      const out: StoredEntry[] = [];
      for (let seq = fromSeq; seq < list.length; seq += 1) {
        const bytes = list[seq];
        if (bytes === undefined) {
          continue;
        }
        out.push({ seq, bytes: bytes.slice() });
      }
      return out;
    },
    async headSeq(docId) {
      assertSafeDocId(docId);
      return logs.get(docId)?.length ?? 0;
    },
  };
}

type DocLock = {
  chain: Promise<unknown>;
};

/**
 * ファイル追記ストア。`{dataDir}/{docId}.ylog` に length-prefixed フレームを並べる。
 */
export function createFileUpdateLogStore(dataDir: string): UpdateLogStore {
  const locks = new Map<string, DocLock>();

  const withLock = async <T>(docId: string, work: () => Promise<T>): Promise<T> => {
    const current = locks.get(docId) ?? { chain: Promise.resolve() };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = current.chain;
    current.chain = previous.then(() => gate);
    locks.set(docId, current);
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  };

  const filePathFor = (docId: string): string => {
    assertSafeDocId(docId);
    return path.join(dataDir, `${docId}.ylog`);
  };

  const ensureDir = async (): Promise<void> => {
    await mkdir(dataDir, { recursive: true });
  };

  const readAll = async (docId: string): Promise<Uint8Array[]> => {
    const filePath = filePathFor(docId);
    try {
      const buffer = await readFile(filePath);
      return parseFrames(new Uint8Array(buffer));
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    }
  };

  return {
    async append(docId, bytes) {
      return withLock(docId, async () => {
        await ensureDir();
        const filePath = filePathFor(docId);
        const frames = await readAll(docId);
        const seq = frames.length;
        const handle = await open(filePath, "a");
        try {
          await handle.write(frame(bytes));
        } finally {
          await handle.close();
        }
        return seq;
      });
    },
    async readFrom(docId, fromSeq) {
      return withLock(docId, async () => {
        const frames = await readAll(docId);
        const out: StoredEntry[] = [];
        for (let seq = fromSeq; seq < frames.length; seq += 1) {
          const bytes = frames[seq];
          if (bytes === undefined) {
            continue;
          }
          out.push({ seq, bytes: bytes.slice() });
        }
        return out;
      });
    },
    async headSeq(docId) {
      return withLock(docId, async () => {
        const frames = await readAll(docId);
        return frames.length;
      });
    },
  };
}
