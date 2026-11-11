#!/usr/bin/env node
import path from "node:path";

import { startRelayServer } from "./server.js";

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

const host = readArg("--host") ?? process.env.RELAY_HOST ?? "127.0.0.1";
const portRaw = readArg("--port") ?? process.env.RELAY_PORT ?? "8787";
const dataDir = readArg("--data-dir") ?? process.env.RELAY_DATA_DIR ?? path.resolve(".relay-data");
const port = Number(portRaw);
if (!Number.isInteger(port) || port < 0) {
  throw new Error(`invalid port: ${portRaw}`);
}

const server = await startRelayServer({ host, port, dataDir });
console.log(
  JSON.stringify({
    ok: true,
    url: server.url,
    host: server.host,
    port: server.port,
    dataDir,
    note: "opaque Yjs update log only; do not expose publicly without auth",
  }),
);

const shutdown = async (): Promise<void> => {
  await server.close();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
