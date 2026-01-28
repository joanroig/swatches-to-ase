import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f3efe9",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(app.getAppPath(), "dist-web", "index.html");
    void win.loadFile(indexPath);
  }
};

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle(
  "save-zip",
  async (_event, options: { fileName: string; data: Uint8Array }) => {
    const result = await dialog.showSaveDialog({
      defaultPath: options.fileName || "swatches-ase.zip",
      filters: [{ name: "Zip", extensions: ["zip"] }],
    });
    if (result.canceled || !result.filePath) {
      return { saved: false };
    }
    await fs.writeFile(result.filePath, options.data);
    return { saved: true, path: result.filePath };
  }
);
