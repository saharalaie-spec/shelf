import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Next.js provides this guard at build time; in tests it's a no-op.
      "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
    },
  },
  test: { include: ["tests/**/*.test.ts"], env: { BOOKS_PROVIDER: "fixture" } },
});
