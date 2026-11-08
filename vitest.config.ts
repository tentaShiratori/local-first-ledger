import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 空のテスト集合を合格扱いにしない（環境確認用スモークテストが必須）
    passWithNoTests: false,
    include: ["src/**/*.test.ts"],
  },
});
