import { PALETTES_KEY } from "../config";
import { state } from "../state";
import type { Palette } from "../types";

export const hydratePalettes = () => {
  const raw = localStorage.getItem(PALETTES_KEY);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw) as {
      palettes?: Palette[];
      activePaletteId?: string | null;
    };
    if (Array.isArray(parsed.palettes)) {
      state.palettes = parsed.palettes;
    }
    state.activePaletteId = parsed.activePaletteId ?? state.activePaletteId;
  } catch {
    // Ignore invalid saved palettes
  }
};
