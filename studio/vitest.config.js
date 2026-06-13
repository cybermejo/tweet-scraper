import { defineConfig } from "vitest/config";

// Standalone test config so the pure-logic suite runs in a plain Node
// environment without pulling in the Vite build plugins (react / tailwind).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.js"],
      reporter: ["text", "text-summary"],
    },
  },
});
