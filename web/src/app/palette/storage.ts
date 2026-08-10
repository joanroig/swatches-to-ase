import { PALETTES_KEY } from "../config";
import { state } from "../state";
import type { Folder, Palette } from "../types";
import { reconcileLibraryOrder } from "./library-order";

export const hydratePalettes = () => {
  const raw = localStorage.getItem(PALETTES_KEY);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw) as {
      palettes?: Palette[];
      folders?: Folder[];
      libraryOrder?: unknown[];
      activePaletteId?: string | null;
    };
    if (Array.isArray(parsed.folders)) {
      state.folders = parsed.folders.filter(
        (folder): folder is Folder => Boolean(folder) && typeof folder.id === "string" && typeof folder.name === "string",
      );
    }
    if (Array.isArray(parsed.palettes)) {
      const folderIds = new Set(state.folders.map((folder) => folder.id));
      state.palettes = parsed.palettes.map((palette) => ({
        ...palette,
        lastModified: typeof palette.lastModified === "number" ? palette.lastModified : 0,
        // Drop references to folders that no longer exist rather than hiding the palette.
        folderId: palette.folderId && folderIds.has(palette.folderId) ? palette.folderId : null,
      }));
    }
    state.libraryOrder = reconcileLibraryOrder(
      Array.isArray(parsed.libraryOrder) ? parsed.libraryOrder.filter((key): key is string => typeof key === "string") : [],
      state.palettes,
      state.folders,
    );
    state.activePaletteId = parsed.activePaletteId ?? state.activePaletteId;
  } catch {
    // Ignore invalid saved palettes
  }
};
