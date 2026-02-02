import { createId } from "../utils/id";
import type { Palette, PaletteColor, Preferences, SyncPayload } from "../types";

const isRgbTuple = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((channel) => typeof channel === "number");

const sanitizeColor = (color: PaletteColor): PaletteColor => ({
  id: color.id,
  name: color.name,
  rgb: [...color.rgb] as [number, number, number],
});

const sanitizePalette = (palette: Palette): Palette => ({
  id: palette.id,
  name: palette.name,
  colors: palette.colors.map(sanitizeColor),
  isPublic: palette.isPublic ?? false,
  publicId: palette.publicId ?? null,
});

export const buildSyncPayload = (
  palettes: Palette[],
  activePaletteId: string | null,
  preferences: Preferences
): SyncPayload => ({
  palettes: palettes.map(sanitizePalette),
  activePaletteId,
  preferences,
  revision: createId(),
});

const isPaletteColor = (value: unknown): value is PaletteColor => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as PaletteColor;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    isRgbTuple(candidate.rgb)
  );
};

const isPalette = (value: unknown): value is Palette => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Palette;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    Array.isArray(candidate.colors) &&
    candidate.colors.every(isPaletteColor)
  );
};

const isPreferences = (value: unknown): value is Preferences => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Preferences;
  return (
    typeof candidate.theme === "string" &&
    typeof candidate.colorNameFormat === "string" &&
    typeof candidate.addBlackWhite === "boolean" &&
    typeof candidate.exportFormat === "string" &&
    typeof candidate.colorNotation === "string" &&
    typeof candidate.autoRenameColors === "boolean"
  );
};

export const parseSyncPayload = (value: unknown): SyncPayload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as SyncPayload;
  if (
    !Array.isArray(candidate.palettes) ||
    !candidate.palettes.every(isPalette) ||
    !isPreferences(candidate.preferences) ||
    typeof candidate.revision !== "string"
  ) {
    return null;
  }
  return {
    palettes: candidate.palettes.map((palette) => ({
      ...palette,
      isPublic: palette.isPublic ?? false,
      publicId: palette.publicId ?? null,
    })),
    activePaletteId: candidate.activePaletteId ?? null,
    preferences: candidate.preferences,
    revision: candidate.revision,
  };
};
