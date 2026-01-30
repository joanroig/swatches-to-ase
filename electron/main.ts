import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
} from "electron";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

const devIconPath = isDev
  ? path.join(process.cwd(), "assets", "icon.png")
  : undefined;

const APP_LINKS = {
  webApp: "https://joanroig.github.io/palette-studio/",
  releases: "https://github.com/joanroig/palette-studio/releases",
  repo: "https://github.com/joanroig/palette-studio",
  issues: "https://github.com/joanroig/palette-studio/issues",
};

const openExternal = (url: string) => {
  void shell.openExternal(url);
};

const showAboutDialog = async () => {
  await dialog.showMessageBox({
    type: "info",
    title: "About Palette Studio",
    message: "Palette Studio",
    detail: `Version ${app.getVersion()}\nImport, edit, and export palettes across Procreate, Adobe, and GIMP formats.`,
    buttons: ["OK"],
  });
};

const createAppMenu = () => {
  const isMac = process.platform === "darwin";
  const menuTemplate = [
    {
      label: "File",
      submenu: [
        {
          label: "Open Web App",
          click: () => openExternal(APP_LINKS.webApp),
        },
        {
          label: "Download Desktop",
          click: () => openExternal(APP_LINKS.releases),
        },
        {
          label: "View Source on GitHub",
          click: () => openExternal(APP_LINKS.repo),
        },
        { type: "separator" },
        ...(isMac
          ? [
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ]
          : [{ role: "quit" }]),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "minimize" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Palette Studio",
          click: () => void showAboutDialog(),
        },
        {
          label: "Report an Issue",
          click: () => openExternal(APP_LINKS.issues),
        },
      ],
    },
  ] as Electron.MenuItemConstructorOptions[];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
};

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f3efe9",
    ...(devIconPath ? { icon: devIconPath } : {}),
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

  const devOrigin = process.env.VITE_DEV_SERVER_URL
    ? new URL(process.env.VITE_DEV_SERVER_URL).origin
    : null;
  const isExternalUrl = (url: string) => {
    if (url.startsWith("file://")) {
      return false;
    }
    if (devOrigin) {
      try {
        return new URL(url).origin !== devOrigin;
      } catch {
        return true;
      }
    }
    return true;
  };

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isExternalUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
};

app.whenReady().then(() => {
  createAppMenu();
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
