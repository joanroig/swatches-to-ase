import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "web",
  base: "./",
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [".."],
    },
  },
  resolve: {
    alias: {
      "@core": path.resolve(rootDir, "src/core"),
    },
  },
});
