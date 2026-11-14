import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

import {
  base64ToBytes,
  bytesToBase64,
  encodeServerMessage,
  parseClientMessage,
  type ServerToClientMessage,
} from "./protocol.js";
import { createFileUpdateLogStore, type UpdateLogStore } from "./store.js";

export type RelayServerOptions = {
  host?: string;
  port?: number;
  dataDir?: string;
  store?: UpdateLogStore;
};

export type RelayServer = {
  url: string;
  host: string;
  port: number;
  store: UpdateLogStore;
  close: () => Promise<void>;
};

type SocketState = {
  docId: string | null;
};

function send(socket: WebSocket, message: ServerToClientMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(encodeServerMessage(message));
  }
}

/**
 * opaque 更新の WebSocket 中継。Yjs を import しない。
 * 保管はドキュメント ID ごとの追記ログのみ。
 */
export async function startRelayServer(options: RelayServerOptions = {}): Promise<RelayServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const store = options.store ?? createFileUpdateLogStore(options.dataDir ?? ".relay-data");

  const httpServer: HttpServer = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("local-first-ledger relay (opaque update log only)\n");
  });

  const wss = new WebSocketServer({ server: httpServer });
  const rooms = new Map<string, Set<WebSocket>>();

  const addToRoom = (docId: string, socket: WebSocket): void => {
    const set = rooms.get(docId) ?? new Set<WebSocket>();
    set.add(socket);
    rooms.set(docId, set);
  };

  const removeFromRoom = (docId: string, socket: WebSocket): void => {
    const set = rooms.get(docId);
    if (set === undefined) {
      return;
    }
    set.delete(socket);
    if (set.size === 0) {
      rooms.delete(docId);
    }
  };

  const broadcastEntry = (
    docId: string,
    seq: number,
    bytes: Uint8Array,
    except?: WebSocket,
  ): void => {
    const set = rooms.get(docId);
    if (set === undefined) {
      return;
    }
    const message: ServerToClientMessage = {
      type: "entry",
      seq,
      updateBase64: bytesToBase64(bytes),
    };
    for (const peer of set) {
      if (peer === except) {
        continue;
      }
      send(peer, message);
    }
  };

  wss.on("connection", (socket) => {
    const state: SocketState = { docId: null };

    socket.on("message", (data) => {
      void (async () => {
        try {
          const raw =
            typeof data === "string" ? data : Buffer.from(data as Buffer).toString("utf8");
          const message = parseClientMessage(raw);

          if (message.type === "subscribe") {
            if (state.docId !== null && state.docId !== message.docId) {
              removeFromRoom(state.docId, socket);
            }
            state.docId = message.docId;
            addToRoom(message.docId, socket);
            const missing = await store.readFrom(message.docId, message.fromSeq);
            for (const entry of missing) {
              send(socket, {
                type: "entry",
                seq: entry.seq,
                updateBase64: bytesToBase64(entry.bytes),
              });
            }
            const headSeq = await store.headSeq(message.docId);
            send(socket, { type: "subscribed", docId: message.docId, headSeq });
            return;
          }

          if (message.type === "push") {
            if (state.docId === null) {
              send(socket, { type: "error", message: "subscribe before push" });
              return;
            }
            const bytes = base64ToBytes(message.updateBase64);
            const seq = await store.append(state.docId, bytes);
            send(socket, { type: "ack", clientMsgId: message.clientMsgId, seq });
            broadcastEntry(state.docId, seq, bytes, socket);
          }
        } catch (error) {
          const text = error instanceof Error ? error.message : "unknown error";
          send(socket, { type: "error", message: text });
        }
      })();
    });

    socket.on("close", () => {
      if (state.docId !== null) {
        removeFromRoom(state.docId, socket);
      }
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, resolve);
  });

  const address = httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("failed to bind relay server");
  }

  return {
    url: `ws://${host}:${address.port}`,
    host,
    port: address.port,
    store,
    close: async () => {
      for (const client of Array.from(wss.clients)) {
        client.terminate();
      }
      rooms.clear();
      await new Promise<void>((resolve, reject) => {
        wss.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          httpServer.closeAllConnections();
          httpServer.close((httpError) => {
            if (httpError) {
              reject(httpError);
              return;
            }
            resolve();
          });
        });
      });
    },
  };
}
