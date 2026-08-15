import { t } from "../i18n";
import { persistPalettes } from "../persistence";
import { readStoredJson, writeStoredJson } from "../utils/storage";
import { libraryState, state } from "../state";
import type { Folder, Palette } from "../types";
import { createId } from "../utils/id";
import { folderLibraryKey, mergeVisibleLibraryOrder, paletteLibraryKey, reconcileLibraryOrder } from "./library-order";

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
  state.libraryOrder = reconcileLibraryOrder(state.libraryOrder, state.palettes, state.folders);
  const folder: Folder = {
    id: createId(),
    name: uniqueFolderName(name?.trim() || t("folder.defaultName")),
  };
  state.folders.push(folder);
  state.libraryOrder.push(folderLibraryKey(folder.id));
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
  state.libraryOrder = reconcileLibraryOrder(state.libraryOrder, state.palettes, state.folders);
  const folderKey = folderLibraryKey(folderId);
  const folderIndex = state.libraryOrder.indexOf(folderKey);
  const released = state.palettes.filter((palette) => palette.folderId === folderId);
  state.folders = state.folders.filter((folder) => folder.id !== folderId);
  released.forEach((palette) => {
    palette.folderId = null;
  });
  const releasedKeys = released.map((palette) => paletteLibraryKey(palette.id));
  state.libraryOrder = state.libraryOrder.filter((key) => key !== folderKey && !releasedKeys.includes(key));
  state.libraryOrder.splice(folderIndex < 0 ? state.libraryOrder.length : folderIndex, 0, ...releasedKeys);
  libraryState.collapsedFolderIds.delete(folderId);
  persistCollapsedFolders();
  persistPalettes();
};

/*
 * Replacing the library wholesale.
 *
 * A folder belongs to the library that holds it. Clearing the palettes used to leave every folder
 * standing, so signing out of an account and choosing to delete the local palettes left a shelf of
 * empty collections nobody had made — and the next sign-in merged those ghosts into the other
 * library. Everything that swaps the whole library out goes through here, so the two can no longer
 * drift apart, and the per-device view state is pruned to match.
 *
 * This is the only place folders are dropped for being empty. A folder you emptied yourself stays:
 * making one before there is anything to put in it is a normal way to start.
 */
export const replaceLibrary = (next: { palettes: Palette[]; folders?: Folder[]; libraryOrder?: readonly string[] }) => {
  state.palettes = next.palettes;
  state.folders = next.folders ?? [];
  state.libraryOrder = reconcileLibraryOrder(next.libraryOrder ?? [], state.palettes, state.folders);
  forgetVanishedFolders();
};

/** Empty the library completely: no palettes, no folders, nothing left browsing a folder. */
export const clearLibrary = () => {
  replaceLibrary({ palettes: [], folders: [], libraryOrder: [] });
};

/**
 * Drop per-device folder state for folders that no longer exist.
 *
 * Collapsed ids are kept in local storage and would otherwise accumulate for the lifetime of the
 * browser, and a folder open on screen when the library is replaced has to close or the view is
 * left pointing at nothing.
 */
const forgetVanishedFolders = () => {
  const known = new Set(state.folders.map((folder) => folder.id));
  let changed = false;
  libraryState.collapsedFolderIds.forEach((folderId) => {
    if (!known.has(folderId)) {
      libraryState.collapsedFolderIds.delete(folderId);
      changed = true;
    }
  });
  if (changed) {
    persistCollapsedFolders();
  }
  if (libraryState.openFolderId && libraryState.openFolderId !== UNFILED_FOLDER_ID && !known.has(libraryState.openFolderId)) {
    libraryState.openFolderId = null;
  }
};

const syncArrayOrderFromLibrary = () => {
  const orderIndex = new Map(state.libraryOrder.map((key, index) => [key, index]));
  state.folders = [...state.folders].sort(
    (left, right) =>
      (orderIndex.get(folderLibraryKey(left.id)) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(folderLibraryKey(right.id)) ?? Number.MAX_SAFE_INTEGER),
  );

  const rootById = new Map(state.palettes.filter((palette) => !palette.folderId).map((palette) => [palette.id, palette]));
  const orderedRoot = state.libraryOrder
    .filter((key) => key.startsWith("palette:"))
    .map((key) => rootById.get(key.slice("palette:".length)))
    .filter((palette): palette is Palette => Boolean(palette));
  state.palettes = state.palettes.map((palette) => (palette.folderId ? palette : (orderedRoot.shift() ?? palette)));
};

/** Commit the mixed DOM order; filtered-out items retain their existing slots. */
export const commitRootLibraryOrder = (visibleOrder: string[]) => {
  const visiblePaletteIds = visibleOrder.filter((key) => key.startsWith("palette:")).map((key) => key.slice("palette:".length));
  state.palettes.forEach((palette) => {
    if (visiblePaletteIds.includes(palette.id)) {
      palette.folderId = null;
    }
  });
  const reconciled = reconcileLibraryOrder(state.libraryOrder, state.palettes, state.folders);
  state.libraryOrder = reconcileLibraryOrder(mergeVisibleLibraryOrder(reconciled, visibleOrder), state.palettes, state.folders);
  syncArrayOrderFromLibrary();
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

/* ------------------------------------------------------- folder navigation --- */

/*
 * Browsing one folder on its own.
 *
 * The id is stored rather than the folder itself, so a folder deleted from under the view — by a
 * cloud merge, say — resolves to nothing and the library falls back to the list of folders. Drafts
 * opens under its sentinel, since it has no folder record to point at.
 */

/** The open group's id, or `null` at the top level. Drafts reports the sentinel, not `null`. */
export const getOpenFolderId = () => {
  const open = libraryState.openFolderId;
  if (!open) {
    return null;
  }
  return open === UNFILED_FOLDER_ID || getFolderById(open) ? open : null;
};

/** Where a palette created right now belongs: the open folder, or Drafts at the top level. */
export const getTargetFolderId = () => resolveFolderId(getOpenFolderId());

export const getOpenFolderName = () => {
  const open = getOpenFolderId();
  if (!open || open === UNFILED_FOLDER_ID) {
    return t("folder.unfiled");
  }
  return getFolderById(open)?.name ?? t("folder.unfiled");
};

export const openFolder = (folderId: string | null) => {
  libraryState.openFolderId = folderId;
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
  state.libraryOrder = reconcileLibraryOrder(state.libraryOrder, state.palettes, state.folders).filter(
    (key) => key !== paletteLibraryKey(paletteId),
  );
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
  if (!folderId) {
    state.libraryOrder.push(paletteLibraryKey(paletteId));
  }
  state.libraryOrder = reconcileLibraryOrder(state.libraryOrder, state.palettes, state.folders);
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
