import WebSocket from "ws";

import type { WebSocketFactory, WebSocketLike } from "../ledger/sync-client.js";

/** Vitest / Node 用: `ws` パッケージをブラウザ互換インターフェースに合わせる。 */
export function createNodeWebSocketFactory(): WebSocketFactory {
  return (url: string): WebSocketLike => {
    const socket = new WebSocket(url);
    return {
      get readyState() {
        return socket.readyState;
      },
      send(data) {
        socket.send(data);
      },
      close() {
        socket.close();
      },
      addEventListener(type, listener) {
        if (type === "open") {
          socket.on("open", () => {
            listener(new Event("open"));
          });
          return;
        }
        if (type === "close") {
          socket.on("close", () => {
            listener(new Event("close"));
          });
          return;
        }
        if (type === "error") {
          socket.on("error", () => {
            listener(new Event("error"));
          });
          return;
        }
        if (type === "message") {
          socket.on("message", (data) => {
            const text =
              typeof data === "string"
                ? data
                : Buffer.isBuffer(data)
                  ? data.toString("utf8")
                  : Buffer.from(data as ArrayBuffer).toString("utf8");
            listener({ data: text } as MessageEvent);
          });
        }
      },
      removeEventListener() {
        // テスト用クライアントは stop() で close するだけなので未実装で足りる
      },
    };
  };
}
