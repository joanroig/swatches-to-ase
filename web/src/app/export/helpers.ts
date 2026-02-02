import type { ExportMode, Palette } from "../types";
import { rgbToHex } from "../utils/color";

export const selectExportTargets = (
  mode: ExportMode,
  palettes: Palette[],
  activePaletteId: string | null
) => {
  if (mode === "single") {
    const palette =
      palettes.find((item) => item.id === activePaletteId) ??
      palettes[0] ??
      null;
    return palette ? [palette] : [];
  }
  return [...palettes];
};

export const selectPrimaryExportPalette = (
  targets: Palette[],
  palettes: Palette[],
  activePaletteId: string | null
) => {
  if (targets.length === 1) {
    return targets[0];
  }
  return (
    palettes.find((item) => item.id === activePaletteId) ?? targets[0] ?? null
  );
};

export const getPaletteHexes = (palette: Palette) =>
  palette.colors.map((color) =>
    rgbToHex(color.rgb).replace("#", "").toLowerCase()
  );
