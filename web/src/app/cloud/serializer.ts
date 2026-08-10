import type {
  Folder,
  Palette,
  PaletteColor,
  Preferences,
  StoredPalette,
  StoredPaletteColor,
  StoredPreferences,
  StoredSyncPayload,
  SyncPayload,
} from "../types";
import { createId } from "../utils/id";
import { reconcileLibraryOrder } from "../palette/library-order";

const isRgbTuple = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((channel) => typeof channel === "number");

const sanitizeColor = (color: PaletteColor): StoredPaletteColor => ({
  id: color.id,
  rgb: [...color.rgb] as [number, number, number],
});

const sanitizePalette = (palette: Palette): StoredPalette => ({
  id: palette.id,
  name: palette.name,
  colors: palette.colors.map(sanitizeColor),
  lastModified: typeof palette.lastModified === "number" ? palette.lastModified : 0,
  isPublic: palette.isPublic ?? false,
  publicId: palette.publicId ?? null,
  folderId: palette.folderId ?? null,
});

const sanitizeFolder = (folder: Folder): Folder => ({ id: folder.id, name: folder.name });

const sanitizePreferences = (preferences: Preferences): StoredPreferences => ({
  theme: preferences.theme,
  colorNameFormat: preferences.colorNameFormat,
  addBlackWhite: preferences.addBlackWhite,
  exportFormat: preferences.exportFormat,
  colorNotation: preferences.colorNotation,
  generateStyle: preferences.generateStyle ?? "shade",
  motion: preferences.motion ?? "system",
  language: preferences.language ?? "system",
});

export const buildSyncPayload = (
  palettes: Palette[],
  folders: Folder[],
  activePaletteId: string | null,
  preferences: Preferences,
  libraryOrder: string[],
): StoredSyncPayload => ({
  palettes: palettes.map(sanitizePalette),
  folders: folders.map(sanitizeFolder),
  libraryOrder: reconcileLibraryOrder(libraryOrder, palettes, folders),
  activePaletteId,
  preferences: sanitizePreferences(preferences),
  revision: createId(),
});

const isStoredPaletteColor = (value: unknown): value is StoredPaletteColor => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as StoredPaletteColor;
  return typeof candidate.id === "string" && isRgbTuple(candidate.rgb);
};

const isStoredPalette = (value: unknown): value is StoredPalette => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as StoredPalette;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    Array.isArray(candidate.colors) &&
    candidate.colors.every(isStoredPaletteColor) &&
    typeof candidate.lastModified === "number" &&
    typeof candidate.isPublic === "boolean" &&
    (candidate.publicId === null || typeof candidate.publicId === "string") &&
    (candidate.folderId === null || typeof candidate.folderId === "string")
  );
};

const isFolder = (value: unknown): value is Folder => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Folder;
  return typeof candidate.id === "string" && typeof candidate.name === "string";
};

const isStoredPreferences = (value: unknown): value is StoredPreferences => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as StoredPreferences;
  return (
    typeof candidate.theme === "string" &&
    typeof candidate.colorNameFormat === "string" &&
    typeof candidate.addBlackWhite === "boolean" &&
    typeof candidate.exportFormat === "string" &&
    typeof candidate.colorNotation === "string" &&
    typeof candidate.generateStyle === "string" &&
    (candidate.motion === "system" || candidate.motion === "on" || candidate.motion === "off") &&
    (candidate.language === "system" || candidate.language === "en" || candidate.language === "es")
  );
};

export const parseSyncPayload = (value: unknown): SyncPayload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as StoredSyncPayload;
  if (
    !Array.isArray(candidate.palettes) ||
    !candidate.palettes.every(isStoredPalette) ||
    !Array.isArray(candidate.folders) ||
    !candidate.folders.every(isFolder) ||
    !Array.isArray(candidate.libraryOrder) ||
    !candidate.libraryOrder.every((key) => typeof key === "string") ||
    (candidate.activePaletteId !== null && typeof candidate.activePaletteId !== "string") ||
    !isStoredPreferences(candidate.preferences) ||
    typeof candidate.revision !== "string"
  ) {
    return null;
  }
  const folders = candidate.folders;
  const folderIds = new Set(folders.map((folder) => folder.id));
  const palettes = candidate.palettes.map((palette) => ({
    id: palette.id,
    name: palette.name,
    colors: palette.colors.map((color) => ({
      id: color.id,
      name: "",
      rgb: [...color.rgb] as [number, number, number],
    })),
    lastModified: palette.lastModified,
    isPublic: palette.isPublic,
    publicId: palette.publicId,
    folderId: palette.folderId && folderIds.has(palette.folderId) ? palette.folderId : null,
  }));
  return {
    folders,
    palettes,
    libraryOrder: reconcileLibraryOrder(candidate.libraryOrder, palettes, folders),
    activePaletteId: candidate.activePaletteId,
    preferences: candidate.preferences,
    revision: candidate.revision,
  };
};
