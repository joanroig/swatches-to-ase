import type { Folder, Palette } from "../types";
import { createId } from "../utils/id";
import { folderLibraryKey, reconcileLibraryOrder } from "../palette/library-order";

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
  // Carried deliberately: a clone that lost its folder reappeared in Drafts, which looks like the
  // merge unfiled it.
  folderId: palette.folderId ?? null,
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

/*
 * Folders are merged by name, not by id.
 *
 * Two devices that never synced give the same folder two different ids, so matching on id would
 * leave you with "Brand" twice. Matching on name treats them as the one folder people meant, which
 * is what happens when the same project is set up on a second machine.
 *
 * Remote ids win, so the folder keeps the identity the cloud already knows. The returned `remap`
 * says which local id each local palette should follow.
 */
const folderKey = (name: string) => name.trim().toLocaleLowerCase();

export type FolderMerge = { folders: Folder[]; remap: Map<string, string> };

export const mergeFolders = (localFolders: Folder[], remoteFolders: Folder[]): FolderMerge => {
  const folders = [...remoteFolders];
  const byName = new Map(remoteFolders.map((folder) => [folderKey(folder.name), folder]));
  const remap = new Map<string, string>();

  localFolders.forEach((folder) => {
    const twin = byName.get(folderKey(folder.name));
    if (twin) {
      remap.set(folder.id, twin.id);
      return;
    }
    // Local-only: keep it, so the palettes filed in it stay filed.
    folders.push(folder);
    byName.set(folderKey(folder.name), folder);
    remap.set(folder.id, folder.id);
  });

  return { folders, remap };
};

export type LibrarySnapshot = { palettes: Palette[]; folders: Folder[]; libraryOrder: string[] };

/**
 * Reconcile a whole local library against the cloud one.
 *
 * The single entry point for the merge, so folders and palettes cannot get out of step. They used
 * to: palettes were merged while `state.folders` was overwritten with the remote list wholesale, so
 * a palette in a local-only folder kept an id that no longer resolved. Such a palette matches
 * neither a folder group nor the unfiled group, and vanished from the library until the next reload
 * normalised it.
 */
export const mergeLibraries = (local: LibrarySnapshot, remote: LibrarySnapshot): LibrarySnapshot => {
  const { folders, remap } = mergeFolders(local.folders, remote.folders);
  const known = new Set(folders.map((folder) => folder.id));

  const relocatedLocal = local.palettes.map((palette) => ({
    ...palette,
    folderId: palette.folderId ? (remap.get(palette.folderId) ?? palette.folderId) : null,
  }));

  const palettes = mergePalettes(relocatedLocal, remote.palettes).map((palette) => ({
    ...palette,
    // Last line of defence: anything still pointing at a folder that did not survive falls back to
    // Drafts rather than disappearing.
    folderId: palette.folderId && known.has(palette.folderId) ? palette.folderId : null,
  }));

  const remappedLocalOrder = local.libraryOrder.map((key) => {
    if (!key.startsWith("folder:")) {
      return key;
    }
    const localId = key.slice("folder:".length);
    return folderLibraryKey(remap.get(localId) ?? localId);
  });
  const libraryOrder = reconcileLibraryOrder([...remote.libraryOrder, ...remappedLocalOrder], palettes, folders);

  return { palettes, folders, libraryOrder };
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
