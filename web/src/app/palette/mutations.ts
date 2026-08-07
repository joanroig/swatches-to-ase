import { editorSubtitle } from "../dom";
import { updateExportAvailability } from "../export/manager";
import { t } from "../i18n";
import { persistPalettes } from "../persistence";
import { state } from "../state";
import type { Palette } from "../types";
import { getEditorPalette, isEditorDirty, isEditorSessionActive, recordEditorSnapshot } from "./editor-session";
import { renderEditor } from "./editor";
import { getColorName, resolveActiveNameFormat } from "./format";
import { renderPaletteList } from "./list";
import { renderViewModal } from "./view";

export const getPaletteById = (paletteId: string | null) => state.palettes.find((item) => item.id === paletteId);

export const syncActivePalette = (paletteId: string | null) => {
  state.activePaletteId = paletteId;
  renderPaletteList();
  renderEditor();
  updateExportAvailability();
  persistPalettes();
};

export const updatePalette = (paletteId: string, updater: (palette: Palette) => void) => {
  const palette = getPaletteById(paletteId);
  if (!palette) {
    return;
  }
  updater(palette);
  palette.lastModified = Date.now();
  renderPaletteList();
  renderEditor();
  updateExportAvailability();
  if (isEditorSessionActive(paletteId)) {
    recordEditorSnapshot(palette);
  } else {
    persistPalettes();
  }
};

export const updatePaletteName = (paletteId: string, nextName: string) => {
  const palette = getPaletteById(paletteId);
  if (!palette) {
    return;
  }
  palette.name = nextName;
  palette.lastModified = Date.now();
  renderPaletteList();
  if (editorSubtitle) {
    editorSubtitle.textContent = t("view.subtitle", {
      name: palette.name,
      count: palette.colors.length,
      colors: t("palette.colors", { count: palette.colors.length }),
    });
  }
  renderViewModal();
  if (isEditorSessionActive(paletteId)) {
    recordEditorSnapshot(palette);
  } else {
    persistPalettes();
  }
};

export const syncPaletteColorNames = (formatOverride?: string) => {
  const nameFormat = resolveActiveNameFormat(formatOverride);
  state.palettes.forEach((palette) => {
    palette.colors.forEach((color, index) => {
      color.name = getColorName(color.rgb, nameFormat, index);
    });
  });
  renderPaletteList();
  renderEditor();
  updateExportAvailability();
  renderViewModal();
  const editorPalette = getEditorPalette();
  if (editorPalette) {
    recordEditorSnapshot(editorPalette);
  }
  if (!isEditorDirty()) {
    persistPalettes();
  }
};

/** Move a colour inside a palette. `toIndex` is the destination slot in the final array. */
export const moveColorToIndex = (paletteId: string, fromIndex: number, toIndex: number) => {
  updatePalette(paletteId, (palette) => {
    if (fromIndex < 0 || fromIndex >= palette.colors.length) {
      return;
    }
    const bounded = Math.min(Math.max(toIndex, 0), palette.colors.length - 1);
    if (bounded === fromIndex) {
      return;
    }
    const [moved] = palette.colors.splice(fromIndex, 1);
    palette.colors.splice(bounded, 0, moved);
  });
};

/** Move a palette inside the library. `toIndex` is the destination slot in the final array. */
export const movePaletteToIndex = (fromIndex: number, toIndex: number) => {
  if (fromIndex < 0 || fromIndex >= state.palettes.length) {
    return;
  }
  const bounded = Math.min(Math.max(toIndex, 0), state.palettes.length - 1);
  if (bounded === fromIndex) {
    return;
  }
  const next = [...state.palettes];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(bounded, 0, moved);
  state.palettes = next;
  persistPalettes();
  renderPaletteList();
  renderEditor();
  updateExportAvailability();
  renderViewModal();
};
