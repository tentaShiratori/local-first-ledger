import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 空のテスト集合を合格扱いにしない（環境確認用スモークテストが必須）
    passWithNoTests: false,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "dist/**",
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
