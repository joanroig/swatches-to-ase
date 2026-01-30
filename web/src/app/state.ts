import type { ExportMode, Palette } from "./types";

export const state = {
  processing: false,
  palettes: [] as Palette[],
  activePaletteId: "" as string | null,
};

export const exportState = {
  mode: "single" as ExportMode,
};

export const viewState = {
  paletteId: null as string | null,
  colorId: null as string | null,
};

export const dragState = {
  paletteId: null as string | null,
  colorId: null as string | null,
};
