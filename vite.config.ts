import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.resolve(rootDir, "package.json"), "utf-8")) as { version?: string };
const deployTime = process.env.FIREBASE_DEPLOY_TIME ?? process.env.DEPLOY_TIME ?? new Date().toISOString();

export default defineConfig({
  root: "web",
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version ?? "0.0.0"),
    __DEPLOY_TIME__: JSON.stringify(deployTime),
  },
  build: {
    outDir: "../dist-web",
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) {
            return;
          }
          const moduleId = id.replaceAll("\\", "/");
          if (moduleId.includes("/firebase/analytics/") || moduleId.includes("/@firebase/analytics/")) {
            return "firebase-analytics";
          }
          if (moduleId.includes("/firebase/app-check/") || moduleId.includes("/@firebase/app-check/")) {
            return "firebase-app-check";
          }
          if (moduleId.includes("/firebase/auth/") || moduleId.includes("/@firebase/auth/")) {
            return "firebase-auth";
          }
          if (moduleId.includes("/firebase/firestore/") || moduleId.includes("/@firebase/firestore/")) {
            return "firebase-firestore";
          }
          if (moduleId.includes("firebase")) {
            return "firebase-core";
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
