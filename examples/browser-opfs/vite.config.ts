import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function stubNodeImports() {
  return {
    name: "stub-node-imports",
    enforce: "pre" as const,
    load(id: string) {
      const normalized = id.replace(/\\/g, "/");
      if (normalized.includes("/node-imports")) {
        return "export function createNodeEnvImports() { return {}; }\n";
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), stubNodeImports()],
  worker: {
    format: "es",
    plugins: () => [stubNodeImports()],
  },
  optimizeDeps: {
    exclude: ["albedo-wasm"],
  },
  assetsInclude: ["**/*.wasm"],
  server: {
    port: 5174,
  },
  preview: {
    port: 5174,
  },
});
