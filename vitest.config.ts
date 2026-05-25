import { defineConfig } from "vitest/config";

// Frontend unit tests run in jsdom so Milkdown/ProseMirror can build a real
// editor instance and exercise the actual serialize/parse pipeline (§3.2 gate).
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
