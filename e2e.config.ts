import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";

const appUrl = process.env.APP_URL ?? "http://127.0.0.1:4173";

export default {
  tests: "e2e/**/*.e2e.ts",
  targets: [
    {
      name: "web",
      engine: web(),
      app: {
        url: appUrl,
        command: {
          executable: "pnpm",
          args: ["exec", "vp", "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
          reuseExisting: true,
          log: ".e2e/logs/app.log",
        },
      },
    },
  ],
  // モデル不要（locator / assertion のみ）
  workers: 1,
} satisfies E2EConfig;
