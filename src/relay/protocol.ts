/**
 * 中継サーバーとクライアントが使う JSON メッセージ。
 * 更新本体は base64 の opaque バイト列。サーバーは中身を解釈しない。
 */

export type ClientToServerMessage =
  | {
      type: "subscribe";
      docId: string;
      /** この連番以上の保管エントリを送ってほしい（0 始まり）。 */
      fromSeq: number;
    }
  | {
      type: "push";
      /** opaque な Yjs 更新バイト列（base64）。 */
      updateBase64: string;
      clientMsgId: string;
    };

export type ServerToClientMessage =
  | {
      type: "subscribed";
      docId: string;
      /** いまのログ長（次に付く連番）。 */
      headSeq: number;
    }
  | {
      type: "entry";
      seq: number;
      updateBase64: string;
    }
  | {
      type: "ack";
      clientMsgId: string;
      seq: number;
    }
  | {
      type: "error";
      message: string;
    };

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function parseClientMessage(raw: string): ClientToServerMessage {
  const value: unknown = JSON.parse(raw);
  if (value === null || typeof value !== "object") {
    throw new Error("client message must be an object");
  }
  const record = value as Record<string, unknown>;
  if (record.type === "subscribe") {
    if (typeof record.docId !== "string" || record.docId.length === 0) {
      throw new Error("subscribe.docId must be a non-empty string");
    }
    if (
      typeof record.fromSeq !== "number" ||
      !Number.isInteger(record.fromSeq) ||
      record.fromSeq < 0
    ) {
      throw new Error("subscribe.fromSeq must be a non-negative integer");
    }
    return { type: "subscribe", docId: record.docId, fromSeq: record.fromSeq };
  }
  if (record.type === "push") {
    if (typeof record.updateBase64 !== "string") {
      throw new Error("push.updateBase64 must be a string");
    }
    if (typeof record.clientMsgId !== "string" || record.clientMsgId.length === 0) {
      throw new Error("push.clientMsgId must be a non-empty string");
    }
    return {
      type: "push",
      updateBase64: record.updateBase64,
      clientMsgId: record.clientMsgId,
    };
  }
  throw new Error(`unknown client message type: ${String(record.type)}`);
}

export function parseServerMessage(raw: string): ServerToClientMessage {
  const value: unknown = JSON.parse(raw);
  if (value === null || typeof value !== "object") {
    throw new Error("server message must be an object");
  }
  const record = value as Record<string, unknown>;
  if (record.type === "subscribed") {
    if (typeof record.docId !== "string") {
      throw new Error("subscribed.docId must be a string");
    }
    if (
      typeof record.headSeq !== "number" ||
      !Number.isInteger(record.headSeq) ||
      record.headSeq < 0
    ) {
      throw new Error("subscribed.headSeq must be a non-negative integer");
    }
    return { type: "subscribed", docId: record.docId, headSeq: record.headSeq };
  }
  if (record.type === "entry") {
    if (typeof record.seq !== "number" || !Number.isInteger(record.seq) || record.seq < 0) {
      throw new Error("entry.seq must be a non-negative integer");
    }
    if (typeof record.updateBase64 !== "string") {
      throw new Error("entry.updateBase64 must be a string");
    }
    return { type: "entry", seq: record.seq, updateBase64: record.updateBase64 };
  }
  if (record.type === "ack") {
    if (typeof record.clientMsgId !== "string") {
      throw new Error("ack.clientMsgId must be a string");
    }
    if (typeof record.seq !== "number" || !Number.isInteger(record.seq) || record.seq < 0) {
      throw new Error("ack.seq must be a non-negative integer");
    }
    return { type: "ack", clientMsgId: record.clientMsgId, seq: record.seq };
  }
  if (record.type === "error") {
    if (typeof record.message !== "string") {
      throw new Error("error.message must be a string");
    }
    return { type: "error", message: record.message };
  }
  throw new Error(`unknown server message type: ${String(record.type)}`);
}

export function encodeClientMessage(message: ClientToServerMessage): string {
  return JSON.stringify(message);
}

export function encodeServerMessage(message: ServerToClientMessage): string {
  return JSON.stringify(message);
}
