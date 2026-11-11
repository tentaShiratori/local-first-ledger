import { afterEach, describe, expect, it } from "vite-plus/test";
import WebSocket from "ws";

import { encodeClientMessage } from "./protocol.js";
import { startRelayServer, type RelayServer } from "./server.js";
import { createMemoryUpdateLogStore } from "./store.js";

describe("relay server error handling", () => {
  let server: RelayServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("returns an error when push arrives before subscribe", async () => {
    server = await startRelayServer({
      host: "127.0.0.1",
      port: 0,
      store: createMemoryUpdateLogStore(),
    });
    const socket = new WebSocket(server.url);
    const messages: string[] = [];
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    socket.on("message", (data) => {
      const text =
        typeof data === "string"
          ? data
          : Buffer.isBuffer(data)
            ? data.toString("utf8")
            : Buffer.from(data as ArrayBuffer).toString("utf8");
      messages.push(text);
    });
    socket.send(
      encodeClientMessage({
        type: "push",
        updateBase64: Buffer.from([1, 2]).toString("base64"),
        clientMsgId: "early",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(messages.some((raw) => raw.includes("subscribe before push"))).toBe(true);
    socket.send("not-json");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(messages.some((raw) => raw.includes('"type":"error"'))).toBe(true);
    socket.close();
  });

  it("serves a plain health response on HTTP", async () => {
    server = await startRelayServer({
      host: "127.0.0.1",
      port: 0,
      store: createMemoryUpdateLogStore(),
    });
    const response = await fetch(`http://${server.host}:${server.port}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/opaque update log/i);
  });
});
