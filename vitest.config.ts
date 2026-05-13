import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./web/src/test/setup.ts"],
    include: ["web/src/**/*.test.ts", "web/src/**/*.test.tsx"],
  },
});
