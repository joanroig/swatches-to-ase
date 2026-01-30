import convert from "color-convert";
import namer from "color-namer/dist/color-namer.js";
import { createSwatchesFile, readSwatchesFile } from "procreate-swatches";

import { AseColor, decodeAse, encodeAse } from "./ase.js";

export type PaletteColor = {
  name: string;
  rgb: [number, number, number];
};

export type Palette = {
  name: string;
  colors: PaletteColor[];
};

export type PaletteFormat = "swatches" | "ase" | "gpl";

export type PaletteImportOptions = {
  colorNameFormat: string;
  addBlackWhite: boolean;
};

const VALID_NAME_FORMATS = [
  "roygbiv",
  "basic",
  "html",
  "x11",
  "pantone",
  "ntc",
];

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(Math.max(value, min), max);

const normalizeRgb = (rgb: number[]): [number, number, number] => {
  const max = Math.max(...rgb);
  if (max > 1.5) {
    return [
      clamp(rgb[0] / 255),
      clamp(rgb[1] / 255),
      clamp(rgb[2] / 255),
    ];
  }
  return [clamp(rgb[0]), clamp(rgb[1]), clamp(rgb[2])];
};

const resolveNameFormat = (format: string) => {
  const normalized = format?.toLowerCase().trim();
  if (!VALID_NAME_FORMATS.includes(normalized)) {
    throw new Error(
      `Invalid color name format! Use one of: ${VALID_NAME_FORMATS.join(", ")}`
    );
  }
  return normalized;
};

const nameColor = (rgb: [number, number, number], format: string) => {
  const hex = `#${convert.rgb.hex([
    Math.round(rgb[0] * 255),
    Math.round(rgb[1] * 255),
    Math.round(rgb[2] * 255),
  ])}`;
  const named = namer(hex) as Record<string, Array<{ name: string }>>;
  const list = named[format];
  if (!list?.length) {
    throw new Error(`No color names available for format "${format}".`);
  }
  return list[0].name;
};

const parseGpl = (text: string): Palette => {
  const lines = text.split(/\r?\n/);
  const colors: PaletteColor[] = [];
  let name = "Imported Palette";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (trimmed.toLowerCase().startsWith("name:")) {
      name = trimmed.slice(5).trim() || name;
      continue;
    }
    if (trimmed.toLowerCase().startsWith("gimp palette")) {
      continue;
    }
    if (trimmed.toLowerCase().startsWith("columns:")) {
      continue;
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) {
      continue;
    }
    const [r, g, b, ...rest] = parts;
    const parsed = [Number(r), Number(g), Number(b)];
    if (parsed.some((value) => !Number.isFinite(value))) {
      console.warn(`GPL parse warning: invalid color values "${trimmed}".`);
      continue;
    }
    const rgb = normalizeRgb(parsed);
    const label = rest.join(" ").trim() || `Color ${colors.length + 1}`;
    colors.push({ name: label, rgb });
  }

  return { name, colors };
};

const parseAse = (data: ArrayBuffer | Uint8Array): Palette => {
  const buffer = data instanceof Uint8Array ? data : new Uint8Array(data);
  const decoded = decodeAse(buffer);
  const colors: PaletteColor[] = [];

  for (const entry of decoded.colors ?? []) {
    const model = (entry.model ?? "RGB").toUpperCase();
    const values = Array.isArray(entry.color) ? entry.color : [];
    let rgb: [number, number, number] = [0, 0, 0];

    if (model === "RGB") {
      rgb = normalizeRgb(values);
    } else if (model === "CMYK") {
      const max = Math.max(...values, 0);
      const scaled = max <= 1 ? values.map((v: number) => v * 100) : values;
      const converted = convert.cmyk.rgb(
        scaled[0] ?? 0,
        scaled[1] ?? 0,
        scaled[2] ?? 0,
        scaled[3] ?? 0
      );
      rgb = normalizeRgb(converted);
    } else if (model === "LAB") {
      const max = Math.max(...values, 0);
      const scaled =
        max <= 1 ? [values[0] * 100, values[1] * 100, values[2] * 100] : values;
      const converted = convert.lab.rgb(
        scaled[0] ?? 0,
        scaled[1] ?? 0,
        scaled[2] ?? 0
      );
      rgb = normalizeRgb(converted);
    } else if (model === "GRAY") {
      const gray = values[0] ?? 0;
      const scaled = gray <= 1 ? gray * 100 : gray;
      const converted = convert.gray.rgb(scaled);
      rgb = normalizeRgb(converted);
    } else {
      rgb = normalizeRgb(values);
    }

    colors.push({
      name: entry.name || `Color ${colors.length + 1}`,
      rgb,
    });
  }

  return {
    name: "Imported ASE",
    colors,
  };
};

const parseSwatches = async (
  data: ArrayBuffer | Uint8Array,
  options: PaletteImportOptions
): Promise<Palette> => {
  const format = resolveNameFormat(options.colorNameFormat);
  const result = await readSwatchesFile(data);
  const colors: PaletteColor[] = [];

  const entries = Array.isArray(result?.colors) ? result.colors : [];
  for (const entry of entries) {
    if (!entry?.[0]) {
      continue;
    }
    const [h, s, v] = entry[0];
    const hsv: [number, number, number] = [h ?? 0, s ?? 0, v ?? 0];
    const rgbRaw = convert.hsv.rgb(hsv);
    const rgb = normalizeRgb(rgbRaw);
    colors.push({
      name: nameColor(rgb, format),
      rgb,
    });
  }

  return {
    name: result?.name || "Imported Swatches",
    colors,
  };
};

const withBlackWhite = (
  palette: Palette,
  options: PaletteImportOptions
): Palette => {
  if (!options.addBlackWhite) {
    return palette;
  }
  const hasColor = (target: [number, number, number]) =>
    palette.colors.some(
      (color) =>
        color.rgb[0] === target[0] &&
        color.rgb[1] === target[1] &&
        color.rgb[2] === target[2]
    );
  const prefix: PaletteColor[] = [];
  if (!hasColor([0, 0, 0])) {
    prefix.push({ name: "black", rgb: [0, 0, 0] });
  }
  if (!hasColor([1, 1, 1])) {
    prefix.push({ name: "white", rgb: [1, 1, 1] });
  }
  return {
    ...palette,
    colors: prefix.concat(palette.colors),
  };
};

export const readPaletteFile = async (
  data: ArrayBuffer | Uint8Array | string,
  fileName: string,
  options: PaletteImportOptions
): Promise<Palette> => {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "swatches") {
    const palette = await parseSwatches(
      data instanceof Uint8Array || data instanceof ArrayBuffer
        ? data
        : new TextEncoder().encode(data),
      options
    );
    return withBlackWhite(palette, options);
  }
  if (ext === "ase") {
    const palette = parseAse(
      data instanceof Uint8Array || data instanceof ArrayBuffer
        ? data
        : new TextEncoder().encode(data)
    );
    return withBlackWhite(palette, options);
  }
  if (ext === "gpl") {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    const palette = parseGpl(text);
    return withBlackWhite(palette, options);
  }
  throw new Error("Unsupported palette format.");
};

export const exportPaletteToAse = (palette: Palette): Uint8Array => {
  const colors: AseColor[] = palette.colors.map((color) => ({
    name: color.name,
    rgb: color.rgb,
    type: "global",
  }));
  return encodeAse(colors);
};

export const exportPaletteToSwatches = async (
  palette: Palette
): Promise<Uint8Array> => {
  const entries: Array<[number[], string]> = palette.colors.map((color) => {
    const rgb: [number, number, number] = [
      Math.round(color.rgb[0] * 255),
      Math.round(color.rgb[1] * 255),
      Math.round(color.rgb[2] * 255),
    ];
    const hsv = convert.rgb.hsv(rgb);
    return [hsv, "hsv"];
  });
  return createSwatchesFile(palette.name, entries, "uint8array");
};

export const exportPaletteToGpl = (palette: Palette): string => {
  const lines = ["GIMP Palette", `Name: ${palette.name}`, "Columns: 8", "#"];
  for (const color of palette.colors) {
    const rgb = [
      Math.round(color.rgb[0] * 255),
      Math.round(color.rgb[1] * 255),
      Math.round(color.rgb[2] * 255),
    ];
    lines.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} ${color.name}`);
  }
  return `${lines.join("\n")}\n`;
};

export const getValidFormats = () => [...VALID_NAME_FORMATS];
export const getSupportedPaletteFormats = () => ["swatches", "ase", "gpl"] as const;
