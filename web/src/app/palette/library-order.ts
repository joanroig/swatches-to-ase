import type { Folder, Palette } from "../types";

export const folderLibraryKey = (folderId: string) => `folder:${folderId}`;
export const paletteLibraryKey = (paletteId: string) => `palette:${paletteId}`;

/**
 * Keep only live top-level items, preserve the saved mixed order, and append anything introduced
 * by an older client or legacy payload. Before mixed ordering existed, the UI was folders first.
 */
export const reconcileLibraryOrder = (order: readonly string[], palettes: readonly Palette[], folders: readonly Folder[]) => {
  const fallback = [
    ...folders.map((folder) => folderLibraryKey(folder.id)),
    ...palettes.filter((palette) => !palette.folderId).map((palette) => paletteLibraryKey(palette.id)),
  ];
  const valid = new Set(fallback);
  const seen = new Set<string>();
  const reconciled: string[] = [];

  [...order, ...fallback].forEach((key) => {
    if (typeof key === "string" && valid.has(key) && !seen.has(key)) {
      seen.add(key);
      reconciled.push(key);
    }
  });
  return reconciled;
};

/**
 * Apply the order currently visible in a filtered grid without disturbing hidden items. A palette
 * arriving from a folder has no old root slot, so it is inserted beside its nearest visible
 * neighbour after the existing visible slots have been reordered.
 */
export const mergeVisibleLibraryOrder = (order: readonly string[], visibleOrder: readonly string[]) => {
  const uniqueVisible = visibleOrder.filter((key, index) => visibleOrder.indexOf(key) === index);
  const visibleSet = new Set(uniqueVisible);
  const existingSet = new Set(order);
  const existingVisible = uniqueVisible.filter((key) => existingSet.has(key));
  const slots = order.map((key, index) => (visibleSet.has(key) ? index : -1)).filter((index) => index >= 0);
  const merged = [...order];

  slots.forEach((slot, index) => {
    const key = existingVisible[index];
    if (key) {
      merged[slot] = key;
    }
  });

  uniqueVisible
    .filter((key) => !existingSet.has(key))
    .forEach((key) => {
      const visibleIndex = uniqueVisible.indexOf(key);
      const previous = [...uniqueVisible.slice(0, visibleIndex)].reverse().find((candidate) => merged.includes(candidate));
      const next = uniqueVisible.slice(visibleIndex + 1).find((candidate) => merged.includes(candidate));
      if (previous) {
        merged.splice(merged.indexOf(previous) + 1, 0, key);
      } else if (next) {
        merged.splice(merged.indexOf(next), 0, key);
      } else {
        merged.push(key);
      }
    });

  return merged;
};
