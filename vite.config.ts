import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "local-first-ledger",
        short_name: "家計簿",
        description: "共有ドキュメントの明細を端末に保存し中継経由で差分同期するオフライン家計簿",
        theme_color: "#1f4d3a",
        background_color: "#eef3ea",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,svg,webp,woff2}"],
        navigateFallback: "/index.html",
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  build: {
    outDir: "dist-app",
    emptyOutDir: true,
  },
  // Oxfmt（Vite+ 同梱）
  fmt: {
    ignorePatterns: [
      ".agents/**",
      ".mise/**",
      "docs/**",
      "coverage/**",
      "dist/**",
      "dist-app/**",
      ".e2e/**",
    ],
  },
  // Oxlint（Vite+ 同梱）
  lint: {
    ignorePatterns: [
      ".agents/**",
      ".mise/**",
      "docs/**",
      "coverage/**",
      "dist/**",
      "dist-app/**",
      ".e2e/**",
      "e2e/**",
    ],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  // Vitest（Vite+ 同梱）
  test: {
    // 空のテスト集合を合格扱いにしない（環境確認用スモークテストが必須）
    passWithNoTests: false,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/relay/cli.ts",
        "src/relay/node-ws.ts",
        "dist/**",
        "dist-app/**",
        "node_modules/**",
        "**/*.config.*",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
