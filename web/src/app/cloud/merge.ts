import type { Palette } from "../types";
import { createId } from "../utils/id";

/**
 * Reconciling the local library with the one stored in the cloud.
 *
 * Pure functions with no Firebase or DOM dependency, split out of `sync.ts` so the rules for what
 * happens when the same palette was edited in two places are readable — and testable — on their
 * own. The guiding rule: a conflict never silently loses an edit. The remote copy wins the id, and
 * the local one survives as a "(BACKUP)" palette the user can compare and delete.
 */

export const clonePalette = (palette: Palette): Palette => ({
  id: palette.id,
  name: palette.name,
  colors: palette.colors.map((color) => ({
    id: color.id,
    name: color.name,
    rgb: [...color.rgb] as [number, number, number],
  })),
  lastModified: typeof palette.lastModified === "number" ? palette.lastModified : 0,
  isPublic: palette.isPublic ?? false,
  publicId: palette.publicId ?? null,
});

export const buildPaletteFingerprint = (palette: Palette) => {
  const colors = palette.colors.map((color) => color.rgb.join(",")).join("|");
  return `${palette.name}::${colors}`;
};

const createBackupPalette = (palette: Palette): Palette => {
  const backup = clonePalette(palette);
  backup.id = createId();
  backup.name = `(BACKUP) ${backup.name}`;
  backup.isPublic = false;
  backup.publicId = null;
  return backup;
};

export const palettesEquivalent = (left: Palette[], right: Palette[]) => {
  if (left.length !== right.length) {
    return false;
  }
  const rightById = new Map(right.map((palette) => [palette.id, palette]));
  return left.every((palette) => {
    const other = rightById.get(palette.id);
    if (!other) {
      return false;
    }
    const leftModified = typeof palette.lastModified === "number" ? palette.lastModified : 0;
    const rightModified = typeof other.lastModified === "number" ? other.lastModified : 0;
    return leftModified === rightModified;
  });
};

export const mergePalettes = (localPalettes: Palette[], remotePalettes: Palette[]) => {
  const merged = [...remotePalettes];
  const remoteById = new Map(remotePalettes.map((palette) => [palette.id, palette]));
  const seenFingerprints = new Set(remotePalettes.map(buildPaletteFingerprint));

  localPalettes.forEach((palette) => {
    const fingerprint = buildPaletteFingerprint(palette);
    const remoteMatch = remoteById.get(palette.id);
    if (remoteMatch) {
      const localModified = typeof palette.lastModified === "number" ? palette.lastModified : 0;
      const remoteModified = typeof remoteMatch.lastModified === "number" ? remoteMatch.lastModified : 0;
      if (localModified !== remoteModified) {
        const backup = createBackupPalette(palette);
        merged.push(backup);
        seenFingerprints.add(buildPaletteFingerprint(backup));
      }
      return;
    }
    if (seenFingerprints.has(fingerprint)) {
      return;
    }
    merged.push(palette);
    seenFingerprints.add(fingerprint);
  });

  return merged;
};

export const resolveMergedActivePaletteId = (remoteActiveId: string | null, localActiveId: string | null, palettes: Palette[]) => {
  if (remoteActiveId && palettes.some((palette) => palette.id === remoteActiveId)) {
    return remoteActiveId;
  }
  if (localActiveId && palettes.some((palette) => palette.id === localActiveId)) {
    return localActiveId;
  }
  return palettes[0]?.id ?? null;
};
