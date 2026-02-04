import type {
  Palette,
  PaletteColor,
  Preferences,
  StoredPalette,
  StoredPaletteColor,
  StoredSyncPayload,
  SyncPayload,
} from "../types";
import { createId } from "../utils/id";

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
});

export const buildSyncPayload = (
  palettes: Palette[],
  activePaletteId: string | null,
  preferences: Preferences,
): StoredSyncPayload => ({
  palettes: palettes.map(sanitizePalette),
  activePaletteId,
  preferences,
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
    candidate.colors.every(isStoredPaletteColor)
  );
};

const isPreferences = (value: unknown): value is Preferences => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Preferences;
  const motionValid =
    typeof candidate.motion === "undefined" || candidate.motion === "system" || candidate.motion === "on" || candidate.motion === "off";
  const languageValid =
    typeof candidate.language === "undefined" ||
    candidate.language === "system" ||
    candidate.language === "en" ||
    candidate.language === "es";
  return (
    typeof candidate.theme === "string" &&
    typeof candidate.colorNameFormat === "string" &&
    typeof candidate.addBlackWhite === "boolean" &&
    typeof candidate.exportFormat === "string" &&
    typeof candidate.colorNotation === "string" &&
    motionValid &&
    languageValid
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
    !isPreferences(candidate.preferences) ||
    typeof candidate.revision !== "string"
  ) {
    return null;
  }
  return {
    palettes: candidate.palettes.map((palette) => ({
      id: palette.id,
      name: palette.name,
      colors: palette.colors.map((color) => ({
        id: color.id,
        name: "",
        rgb: [...color.rgb] as [number, number, number],
      })),
      lastModified: typeof palette.lastModified === "number" ? palette.lastModified : 0,
      isPublic: palette.isPublic ?? false,
      publicId: palette.publicId ?? null,
    })),
    activePaletteId: candidate.activePaletteId ?? null,
    preferences: candidate.preferences,
    revision: candidate.revision,
  };
};
