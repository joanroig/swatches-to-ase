import { getValidFormats } from "@core/palette";

export const STORAGE_KEY = "palette-studio.preferences";
export const PALETTES_KEY = "palette-studio.palettes";
export const SHARE_BASE_URL = "https://joanroig.github.io/palette-studio/";
export const VALID_NAME_FORMATS = getValidFormats();

export const COLOR_NOTATIONS = [
  { value: "hex", label: "HEX" },
  { value: "rgb", label: "RGB" },
  { value: "hsl", label: "HSL" },
  { value: "hsv", label: "HSB" },
  { value: "cmyk", label: "CMYK" },
  { value: "lab", label: "LAB" },
  { value: "name", label: "Name" },
];

export const STYLE_LABELS: Record<string, string> = {
  analogous: "Analogous",
  "cold-pair": "Cold Pair",
  complementary: "Complementary",
  contrasting: "Contrasting",
  neutral: "Neutral",
  "pastel-pair": "Pastel Pair",
  "same-family": "Same Family",
  shade: "Shade",
  triadic: "Triadic",
  "vivid-pair": "Vivid Pair",
  "warm-cold": "Warm / Cold",
  "warm-pair": "Warm Pair",
};
