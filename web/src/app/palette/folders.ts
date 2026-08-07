import { t } from "../i18n";
import { persistPalettes } from "../persistence";
import { readStoredJson, writeStoredJson } from "../utils/storage";
import { libraryState, state } from "../state";
import type { Folder, Palette } from "../types";
import { createId } from "../utils/id";

/** Sentinel used by the DOM for the section that holds palettes with no folder. */
export const UNFILED_FOLDER_ID = "__unfiled__";

export const getFolderById = (folderId: string | null | undefined) =>
  folderId ? state.folders.find((folder) => folder.id === folderId) : undefined;

/** Normalise a folder id coming from the DOM or from stored data. */
export const resolveFolderId = (folderId: string | null | undefined) => {
  if (!folderId || folderId === UNFILED_FOLDER_ID) {
    return null;
  }
  return getFolderById(folderId) ? folderId : null;
};

export const getPalettesInFolder = (folderId: string | null) => state.palettes.filter((palette) => (palette.folderId ?? null) === folderId);

const uniqueFolderName = (base: string) => {
  const existing = new Set(state.folders.map((folder) => folder.name));
  if (!existing.has(base)) {
    return base;
  }
  let suffix = 2;
  while (existing.has(`${base} ${suffix}`)) {
    suffix += 1;
  }
  return `${base} ${suffix}`;
};

export const createFolder = (name?: string): Folder => {
  const folder: Folder = {
    id: createId(),
    name: uniqueFolderName(name?.trim() || t("folder.defaultName")),
  };
  state.folders.push(folder);
  persistPalettes();
  return folder;
};

export const renameFolder = (folderId: string, nextName: string) => {
  const folder = getFolderById(folderId);
  const trimmed = nextName.trim();
  if (!folder || !trimmed || folder.name === trimmed) {
    return;
  }
  folder.name = trimmed;
  persistPalettes();
};

/** Deleting a folder never deletes palettes; they fall back to the unfiled section. */
export const deleteFolder = (folderId: string) => {
  if (!getFolderById(folderId)) {
    return;
  }
  state.folders = state.folders.filter((folder) => folder.id !== folderId);
  state.palettes.forEach((palette) => {
    if (palette.folderId === folderId) {
      palette.folderId = null;
    }
  });
  libraryState.collapsedFolderIds.delete(folderId);
  persistCollapsedFolders();
  persistPalettes();
};

export const moveFolderToIndex = (fromIndex: number, toIndex: number) => {
  if (fromIndex < 0 || fromIndex >= state.folders.length) {
    return;
  }
  const bounded = Math.min(Math.max(toIndex, 0), state.folders.length - 1);
  if (bounded === fromIndex) {
    return;
  }
  const next = [...state.folders];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(bounded, 0, moved);
  state.folders = next;
  persistPalettes();
};

/*
 * Which groups are collapsed, kept per device.
 *
 * Local storage rather than the synced preferences: which folders you happen to have furled is a
 * property of this screen, not of the library, and putting it in the sync payload would mean a
 * Firestore rules migration for something nobody wants mirrored to another machine.
 */
const COLLAPSED_STORAGE_KEY = "palette-studio.collapsed-folders";

const persistCollapsedFolders = () => {
  writeStoredJson(COLLAPSED_STORAGE_KEY, [...libraryState.collapsedFolderIds]);
};

export const restoreCollapsedFolders = () => {
  const stored = readStoredJson<unknown[]>(COLLAPSED_STORAGE_KEY, [], (value): value is unknown[] => Array.isArray(value));
  libraryState.collapsedFolderIds = new Set(stored.filter((id): id is string => typeof id === "string"));
};

export const isFolderCollapsed = (folderId: string) => libraryState.collapsedFolderIds.has(folderId);

export const toggleFolderCollapsed = (folderId: string) => {
  if (libraryState.collapsedFolderIds.has(folderId)) {
    libraryState.collapsedFolderIds.delete(folderId);
  } else {
    libraryState.collapsedFolderIds.add(folderId);
  }
  persistCollapsedFolders();
};

/**
 * Reposition a palette, optionally into a different folder.
 *
 * `toIndex` is the destination slot *within the target folder*, so the global `state.palettes`
 * order is rebuilt from the per-folder orders to keep both views consistent.
 */
export const movePaletteToFolderIndex = (paletteId: string, targetFolderId: string | null, toIndex: number) => {
  const palette = state.palettes.find((item) => item.id === paletteId);
  if (!palette) {
    return;
  }
  const folderId = resolveFolderId(targetFolderId);
  const remaining = state.palettes.filter((item) => item.id !== paletteId);
  const target = remaining.filter((item) => (item.folderId ?? null) === folderId);
  const bounded = Math.min(Math.max(toIndex, 0), target.length);

  palette.folderId = folderId;
  target.splice(bounded, 0, palette);

  // Rebuild the flat list: every other folder keeps its order, the target folder uses the new one.
  const targetQueue = [...target];
  const next: Palette[] = [];
  const seen = new Set<string>();
  remaining.forEach((item) => {
    if ((item.folderId ?? null) === folderId) {
      const nextInTarget = targetQueue.shift();
      if (nextInTarget && !seen.has(nextInTarget.id)) {
        next.push(nextInTarget);
        seen.add(nextInTarget.id);
      }
      return;
    }
    next.push(item);
    seen.add(item.id);
  });
  targetQueue.forEach((item) => {
    if (!seen.has(item.id)) {
      next.push(item);
      seen.add(item.id);
    }
  });
  if (!seen.has(palette.id)) {
    next.push(palette);
  }

  state.palettes = next;
  persistPalettes();
};

/** Case-insensitive match on the palette name, its folder name, or any of its hex values. */
export const matchesLibrarySearch = (palette: Palette, query: string, hexes: string[]) => {
  if (!query) {
    return true;
  }
  if (palette.name.toLowerCase().includes(query)) {
    return true;
  }
  const folder = getFolderById(palette.folderId);
  if (folder?.name.toLowerCase().includes(query)) {
    return true;
  }
  return hexes.some((hex) => hex.includes(query));
};
