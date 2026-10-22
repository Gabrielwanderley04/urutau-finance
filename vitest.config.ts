import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Os módulos de servidor importam "server-only", que só existe dentro do Next.
      "server-only": path.resolve(import.meta.dirname, "tests/apoio/vazio.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"], fileParallelism: false },
});
