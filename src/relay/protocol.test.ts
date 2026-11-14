import { describe, expect, it } from "vite-plus/test";

import {
  base64ToBytes,
  bytesToBase64,
  encodeClientMessage,
  encodeServerMessage,
  parseClientMessage,
  parseServerMessage,
} from "./protocol.js";

describe("relay protocol", () => {
  it("round-trips opaque bytes through base64", () => {
    const bytes = new Uint8Array([0, 1, 255, 10, 32]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("parses subscribe and push messages", () => {
    const subscribe = parseClientMessage(
      encodeClientMessage({ type: "subscribe", docId: "family-demo", fromSeq: 2 }),
    );
    expect(subscribe).toEqual({ type: "subscribe", docId: "family-demo", fromSeq: 2 });

    const push = parseClientMessage(
      encodeClientMessage({
        type: "push",
        updateBase64: bytesToBase64(new Uint8Array([9, 8])),
        clientMsgId: "msg-1",
      }),
    );
    expect(push.type).toBe("push");
  });

  it("parses server entry and ack", () => {
    const entry = parseServerMessage(
      encodeServerMessage({
        type: "entry",
        seq: 0,
        updateBase64: bytesToBase64(new Uint8Array([1])),
      }),
    );
    expect(entry.type).toBe("entry");
    const ack = parseServerMessage(encodeServerMessage({ type: "ack", clientMsgId: "a", seq: 3 }));
    expect(ack).toEqual({ type: "ack", clientMsgId: "a", seq: 3 });
  });

  it("rejects unsafe client payloads", () => {
    expect(() =>
      parseClientMessage(JSON.stringify({ type: "subscribe", docId: "", fromSeq: 0 })),
    ).toThrow();
    expect(() => parseClientMessage(JSON.stringify({ type: "nope" }))).toThrow();
  });
});
