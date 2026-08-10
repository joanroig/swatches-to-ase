import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopApi", {
  saveZip: (options: { fileName: string; data: Uint8Array }) => ipcRenderer.invoke("save-zip", options),
  onOpenLegal: (handler: () => void) => {
    ipcRenderer.on("open-legal", () => handler());
  },
});
