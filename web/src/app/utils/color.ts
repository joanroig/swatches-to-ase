import convert from "color-convert";

import type { PaletteColor } from "../types";
import { clamp, normalizeHue } from "./math";

export const normalizeHex = (hex: string) =>
  hex.startsWith("#") ? hex : `#${hex}`;

export const rgbToHex = (rgb: [number, number, number]) =>
  `#${rgb
    .map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0"))
    .join("")}`;

export const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = normalizeHex(hex).replace("#", "");
  const parsed = [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
  return [parsed[0] / 255, parsed[1] / 255, parsed[2] / 255];
};

export const getRgb255 = (rgb: [number, number, number]) =>
  rgb.map((channel) => Math.round(channel * 255)) as [number, number, number];

export const formatColorValue = (color: PaletteColor, notation: string) => {
  const [r, g, b] = getRgb255(color.rgb);
  switch (notation) {
    case "rgb":
      return `${r}, ${g}, ${b}`;
    case "hsl": {
      const [h, s, l] = convert.rgb.hsl(r, g, b);
      return `${Math.round(h)}°, ${Math.round(s)}%, ${Math.round(l)}%`;
    }
    case "hsv": {
      const [h, s, v] = convert.rgb.hsv(r, g, b);
      return `${Math.round(h)}°, ${Math.round(s)}%, ${Math.round(v)}%`;
    }
    case "cmyk": {
      const [c, m, y, k] = convert.rgb.cmyk(r, g, b);
      return `${Math.round(c)}%, ${Math.round(m)}%, ${Math.round(y)}%, ${Math.round(
        k
      )}%`;
    }
    case "lab": {
      const [l, a, labB] = convert.rgb.lab(r, g, b);
      return `L${Math.round(l)} a${Math.round(a)} b${Math.round(labB)}`;
    }
    case "name":
      return color.name;
    default:
      return rgbToHex(color.rgb).toUpperCase();
  }
};

export const getHueFromHex = (hex: string) => {
  const [r, g, b] = getRgb255(hexToRgb(hex));
  const [h] = convert.rgb.hsl(r, g, b);
  return Number.isFinite(h) ? h : 0;
};

export const hslToRgb = (hue: number, saturation: number, lightness: number) => {
  const h = normalizeHue(hue);
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [r + m, g + m, b + m] as [number, number, number];
};

export const getContrastColor = (rgb: [number, number, number]) => {
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return luminance > 0.62 ? "#0f172a" : "#f8fafc";
};

export const getColorMetrics = (rgb: [number, number, number]) => {
  const [r, g, b] = getRgb255(rgb);
  const [hsbH, hsbS, hsbV] = convert.rgb.hsv(r, g, b);
  const [hslH, hslS, hslL] = convert.rgb.hsl(r, g, b);
  const [c, m, y, k] = convert.rgb.cmyk(r, g, b);
  const [labL, labA, labB] = convert.rgb.lab(r, g, b);
  return {
    r,
    g,
    b,
    hsb: [hsbH, hsbS, hsbV] as [number, number, number],
    hsl: [hslH, hslS, hslL] as [number, number, number],
    cmyk: [c, m, y, k] as [number, number, number, number],
    lab: [labL, labA, labB] as [number, number, number],
  };
};
