import { describe, expect, it } from "vite-plus/test";

import { parseClientMessage, parseServerMessage } from "./protocol.js";

describe("protocol error branches", () => {
  it("rejects non-object and invalid subscribe/push fields", () => {
    expect(() => parseClientMessage("null")).toThrow(/object/);
    expect(() =>
      parseClientMessage(JSON.stringify({ type: "subscribe", docId: 1, fromSeq: 0 })),
    ).toThrow();
    expect(() =>
      parseClientMessage(JSON.stringify({ type: "subscribe", docId: "a", fromSeq: -1 })),
    ).toThrow();
    expect(() =>
      parseClientMessage(JSON.stringify({ type: "push", updateBase64: 1, clientMsgId: "x" })),
    ).toThrow();
    expect(() =>
      parseClientMessage(JSON.stringify({ type: "push", updateBase64: "YQ==", clientMsgId: "" })),
    ).toThrow();
  });

  it("rejects invalid server message variants", () => {
    expect(() => parseServerMessage("null")).toThrow(/object/);
    expect(() =>
      parseServerMessage(JSON.stringify({ type: "subscribed", docId: 1, headSeq: 0 })),
    ).toThrow();
    expect(() =>
      parseServerMessage(JSON.stringify({ type: "subscribed", docId: "a", headSeq: -1 })),
    ).toThrow();
    expect(() =>
      parseServerMessage(JSON.stringify({ type: "entry", seq: -1, updateBase64: "YQ==" })),
    ).toThrow();
    expect(() =>
      parseServerMessage(JSON.stringify({ type: "entry", seq: 0, updateBase64: 1 })),
    ).toThrow();
    expect(() =>
      parseServerMessage(JSON.stringify({ type: "ack", clientMsgId: 1, seq: 0 })),
    ).toThrow();
    expect(() =>
      parseServerMessage(JSON.stringify({ type: "ack", clientMsgId: "a", seq: -1 })),
    ).toThrow();
    expect(() => parseServerMessage(JSON.stringify({ type: "error", message: 1 }))).toThrow();
    expect(() => parseServerMessage(JSON.stringify({ type: "nope" }))).toThrow();
    expect(parseServerMessage(JSON.stringify({ type: "error", message: "x" }))).toEqual({
      type: "error",
      message: "x",
    });
  });
});
