import * as Y from "yjs";

import {
  base64ToBytes,
  bytesToBase64,
  encodeClientMessage,
  parseServerMessage,
} from "../relay/protocol.js";
import {
  createMemoryOutboundQueue,
  createMemorySyncCursor,
  type OutboundQueueStore,
  type SyncCursorStore,
} from "./outbound-queue.js";

export const RELAY_UPDATE_ORIGIN = "local-first-ledger:relay";

export type SyncStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export type WebSocketLike = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  addEventListener: (type: string, listener: (event: MessageEvent | Event) => void) => void;
  removeEventListener: (type: string, listener: (event: MessageEvent | Event) => void) => void;
};

export type WebSocketFactory = (url: string) => WebSocketLike;

export type LedgerSyncClientOptions = {
  doc: Y.Doc;
  docId: string;
  relayUrl: string;
  createWebSocket?: WebSocketFactory;
  outbound?: OutboundQueueStore;
  cursor?: SyncCursorStore;
  /** 再接続の初期待ち（ミリ秒）。 */
  reconnectDelayMs?: number;
  onStatus?: (status: SyncStatus, detail?: string) => void;
};

export type LedgerSyncClient = {
  start: () => void;
  stop: () => void;
  status: () => SyncStatus;
  /** テスト用: 未送信キューをフラッシュしようとする。 */
  flushOutbound: () => Promise<void>;
};

const WS_OPEN = 1;

function defaultWebSocketFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
}

/**
 * Y.Doc のローカル更新を中継へ送り、サーバー保管の opaque 更新を取り込む。
 * オフライン中の更新は outbound キューに残し、ack まで保持する。
 */
export function createLedgerSyncClient(options: LedgerSyncClientOptions): LedgerSyncClient {
  const outbound = options.outbound ?? createMemoryOutboundQueue();
  const cursor = options.cursor ?? createMemorySyncCursor();
  const createWebSocket = options.createWebSocket ?? defaultWebSocketFactory;
  const reconnectDelayMs = options.reconnectDelayMs ?? 500;

  let status: SyncStatus = "idle";
  let socket: WebSocketLike | null = null;
  let stopped = true;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let subscribed = false;
  const inflight = new Set<string>();

  const setStatus = (next: SyncStatus, detail?: string): void => {
    status = next;
    options.onStatus?.(next, detail);
  };

  const advanceCursor = async (seq: number): Promise<void> => {
    const current = await cursor.getFromSeq();
    const next = seq + 1;
    if (next > current) {
      await cursor.setFromSeq(next);
    }
  };

  const applyRemote = (updateBase64: string): void => {
    const bytes = base64ToBytes(updateBase64);
    Y.applyUpdate(options.doc, bytes, RELAY_UPDATE_ORIGIN);
  };

  const flushOutbound = async (): Promise<void> => {
    const current = socket;
    if (current === null || current.readyState !== WS_OPEN || !subscribed) {
      return;
    }
    const pending = await outbound.list();
    for (const item of pending) {
      if (inflight.has(item.id)) {
        continue;
      }
      if (socket !== current || current.readyState !== WS_OPEN || !subscribed) {
        return;
      }
      inflight.add(item.id);
      try {
        current.send(
          encodeClientMessage({
            type: "push",
            updateBase64: bytesToBase64(item.bytes),
            clientMsgId: item.id,
          }),
        );
      } catch {
        inflight.delete(item.id);
        return;
      }
    }
  };

  const onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === RELAY_UPDATE_ORIGIN) {
      return;
    }
    void (async () => {
      try {
        await outbound.enqueue(update);
        await flushOutbound();
      } catch {
        // 切断中の送信失敗は再接続後の flush に任せる
      }
    })();
  };
  const clearReconnect = (): void => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = (): void => {
    if (stopped) {
      return;
    }
    clearReconnect();
    reconnectTimer = setTimeout(() => {
      connect();
    }, reconnectDelayMs);
  };

  const handleMessage = (raw: string): void => {
    void (async () => {
      const message = parseServerMessage(raw);
      if (message.type === "subscribed") {
        subscribed = true;
        setStatus("connected");
        await flushOutbound();
        return;
      }
      if (message.type === "entry") {
        applyRemote(message.updateBase64);
        await advanceCursor(message.seq);
        return;
      }
      if (message.type === "ack") {
        await outbound.remove(message.clientMsgId);
        inflight.delete(message.clientMsgId);
        await advanceCursor(message.seq);
        return;
      }
      if (message.type === "error") {
        setStatus("error", message.message);
      }
    })();
  };

  const connect = (): void => {
    if (stopped) {
      return;
    }
    clearReconnect();
    subscribed = false;
    inflight.clear();
    setStatus("connecting");

    if (socket !== null) {
      const previous = socket;
      socket = null;
      previous.close();
    }

    const next = createWebSocket(options.relayUrl);
    socket = next;
    const onOpen = (): void => {
      void (async () => {
        const fromSeq = await cursor.getFromSeq();
        next.send(
          encodeClientMessage({
            type: "subscribe",
            docId: options.docId,
            fromSeq,
          }),
        );
      })();
    };

    const onMessage = (event: MessageEvent | Event): void => {
      if (!("data" in event)) {
        return;
      }
      const data = event.data;
      if (typeof data === "string") {
        handleMessage(data);
        return;
      }
      if (data instanceof ArrayBuffer) {
        handleMessage(new TextDecoder().decode(data));
        return;
      }
      if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
        handleMessage(data.toString("utf8"));
      }
    };

    const onClose = (): void => {
      if (socket !== next) {
        return;
      }
      subscribed = false;
      socket = null;
      if (!stopped) {
        setStatus("disconnected");
        scheduleReconnect();
      }
    };

    const onError = (): void => {
      if (socket !== next) {
        return;
      }
      setStatus("error", "websocket error");
    };
    next.addEventListener("open", onOpen);
    next.addEventListener("message", onMessage);
    next.addEventListener("close", onClose);
    next.addEventListener("error", onError);
  };

  return {
    start() {
      if (!stopped) {
        return;
      }
      stopped = false;
      options.doc.on("update", onDocUpdate);
      connect();
    },
    stop() {
      stopped = true;
      clearReconnect();
      options.doc.off("update", onDocUpdate);
      subscribed = false;
      const current = socket;
      socket = null;
      current?.close();
      setStatus("idle");
    },
    status() {
      return status;
    },
    flushOutbound,
  };
}

export function resolveRelayUrl(source: {
  searchParams?: URLSearchParams;
  storage?: Pick<Storage, "getItem" | "setItem">;
  defaultUrl?: string;
}): string {
  const fallback = source.defaultUrl ?? "ws://127.0.0.1:8787";
  const fromQuery = source.searchParams?.get("relay")?.trim();
  if (fromQuery !== undefined && fromQuery.length > 0) {
    source.storage?.setItem("local-first-ledger:relay-url", fromQuery);
    return fromQuery;
  }
  const fromStorage = source.storage?.getItem("local-first-ledger:relay-url");
  if (fromStorage !== null && fromStorage !== undefined && fromStorage.length > 0) {
    return fromStorage;
  }
  return fallback;
}
