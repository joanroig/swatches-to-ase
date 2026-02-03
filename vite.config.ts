import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.resolve(rootDir, "package.json"), "utf-8")) as { version?: string };

export default defineConfig({
  root: "web",
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version ?? "0.0.0"),
  },
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) {
            return;
          }
          if (id.includes("firebase")) {
            return "firebase";
          }
          if (id.includes("jszip")) {
            return "jszip";
          }
          if (id.includes("color-namer")) {
            return "color-namer";
          }
          if (id.includes("color-convert")) {
            return "color-convert";
          }
          if (id.includes("procreate-swatches")) {
            return "procreate-swatches";
          }
          return "vendor";
        },
      },
    },
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
