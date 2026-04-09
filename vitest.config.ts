import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/tests/**/*.test.ts", "lib/**/tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": __dirname,
      "@levelyst/contracts": path.resolve(__dirname, "packages/contracts/src/index.ts"),
      "@levelyst/dependency-resolver": path.resolve(__dirname, "packages/dependency-resolver/src/index.ts"),
      "@levelyst/module-registry": path.resolve(__dirname, "packages/module-registry/src/index.ts"),
      "@levelyst/runtime-input": path.resolve(__dirname, "packages/runtime-input/src/index.ts"),
      "@levelyst/runtime-web-2d": path.resolve(__dirname, "packages/runtime-web-2d/src/index.ts"),
      "@levelyst/runtime-web-3d": path.resolve(__dirname, "packages/runtime-web-3d/src/index.ts"),
      "@levelyst/spec-compiler": path.resolve(__dirname, "packages/spec-compiler/src/index.ts"),
    },
  },
})
