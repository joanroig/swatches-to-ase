import type { Palette, SharedPalettePayload } from "./types";
import { SHARE_BASE_URL } from "./config";
import { rgbToHex } from "./utils/color";

export const encodeSharedPalette = (palette: Palette) => {
  const payload: SharedPalettePayload = {
    name: palette.name,
    colors: palette.colors.map((color) => ({
      name: color.name,
      hex: rgbToHex(color.rgb).replace("#", "").toUpperCase(),
    })),
  };
  return btoa(encodeURIComponent(JSON.stringify(payload)));
};

export const decodeSharedPalette = (encoded: string) => {
  try {
    const decoded = decodeURIComponent(atob(encoded));
    const payload = JSON.parse(decoded) as SharedPalettePayload;
    if (!payload || !Array.isArray(payload.colors)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

export const buildSharedPaletteUrl = (palette: Palette) =>
  `${SHARE_BASE_URL}?import=${encodeURIComponent(encodeSharedPalette(palette))}`;
