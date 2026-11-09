import { defineConfig } from "vite-plus";

export default defineConfig({
  // Oxfmt（Vite+ 同梱）
  fmt: {
    ignorePatterns: [".agents/**", ".mise/**", "docs/**", "coverage/**", "dist/**"],
  },
  // Oxlint（Vite+ 同梱）
  lint: {
    ignorePatterns: [".agents/**", ".mise/**", "docs/**", "coverage/**", "dist/**"],
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
      exclude: ["src/**/*.test.ts", "dist/**", "node_modules/**", "**/*.config.*"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
