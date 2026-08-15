import convert from "color-convert";

// Type-only, so this stays a leaf module: `palette.ts` imports the readers, never the other way.
import type { Palette, PaletteColor } from "./palette.js";

/*
 * Parsers for the palette formats Palette Studio reads but does not write.
 *
 * They live apart from `palette.ts` because reading is the open end of the app: the list grows
 * whenever another tool's export lands in someone's downloads folder, and none of it should crowd
 * out the three formats the converter is actually built around.
 *
 * Every parser here is total: a file it cannot make sense of yields no colors rather than throwing,
 * and the caller reports the empty palette. Palette files in the wild are full of trailing junk.
 */

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const fromBytes = (r: number, g: number, b: number): [number, number, number] => [clamp01(r / 255), clamp01(g / 255), clamp01(b / 255)];

const defaultName = (index: number) => `Color ${index + 1}`;

/** Named for the file it came from, since none of these formats is required to carry a title. */
export const paletteNameFromFile = (fileName: string) => fileName.replace(/\.[^.]+$/, "").trim() || "Imported Palette";

const toBytes = (data: ArrayBuffer | Uint8Array | string): Uint8Array => {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  return data instanceof Uint8Array ? data : new Uint8Array(data);
};

const toText = (data: ArrayBuffer | Uint8Array | string): string => (typeof data === "string" ? data : new TextDecoder().decode(data));

/* ------------------------------------------------------------------ hex text --- */

/**
 * `#rgb`, `#rrggbb`, `#rrggbbaa` or the same without the hash.
 *
 * Alpha is read and dropped: a palette entry is a color, and a half-transparent swatch imported as a
 * lighter one would be a quiet lie about what the file said.
 */
export const parseHexColor = (value: string): [number, number, number] | null => {
  const cleaned = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    return null;
  }
  if (cleaned.length === 3) {
    const [r, g, b] = cleaned.split("");
    return fromBytes(parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16));
  }
  if (cleaned.length === 6 || cleaned.length === 8) {
    return fromBytes(parseInt(cleaned.slice(0, 2), 16), parseInt(cleaned.slice(2, 4), 16), parseInt(cleaned.slice(4, 6), 16));
  }
  return null;
};

/**
 * A plain list of colors, one per line — what Coolors, paint.net and a hundred scripts export.
 *
 * `;` and `#` start comments, except where a `#` is the start of a color, and a trailing word on a
 * line is taken as the color's name so `#FF9900 Marigold` survives the trip.
 */
const parseHexList = (text: string, fileName: string): Palette => {
  const colors: PaletteColor[] = [];
  for (const line of text.split(/\r?\n/)) {
    const withoutComment = line.split(";")[0].trim();
    if (!withoutComment) {
      continue;
    }
    const [token, ...rest] = withoutComment.split(/[\s,]+/).filter(Boolean);
    if (!token) {
      continue;
    }
    // paint.net writes eight digits as AARRGGBB, the opposite way round from CSS's RRGGBBAA.
    const cleaned = token.replace(/^#/, "");
    const rgb = cleaned.length === 8 && !token.startsWith("#") ? parseHexColor(cleaned.slice(2)) : parseHexColor(token);
    if (!rgb) {
      continue;
    }
    colors.push({ name: rest.join(" ").trim() || defaultName(colors.length), rgb });
  }
  return { name: paletteNameFromFile(fileName), colors };
};

/* ---------------------------------------------------------------- stylesheets --- */

const CSS_DECLARATION = /(?:--|\$|@)([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/g;
const CSS_BARE_COLOR = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g;

const parseCssColorValue = (value: string): [number, number, number] | null => {
  if (value.startsWith("#")) {
    return parseHexColor(value);
  }
  const parts = value
    .slice(value.indexOf("(") + 1, value.lastIndexOf(")"))
    .split(/[\s,/]+/)
    .filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  const channels = parts.slice(0, 3).map((part) => (part.endsWith("%") ? (Number.parseFloat(part) / 100) * 255 : Number.parseFloat(part)));
  if (channels.some((channel) => !Number.isFinite(channel))) {
    return null;
  }
  return fromBytes(channels[0], channels[1], channels[2]);
};

/**
 * A stylesheet's colors, in the order they are declared.
 *
 * Custom properties and Sass/Less variables come first with their names attached; if the file
 * declares none, every literal color in it is taken instead, so a theme pasted from anywhere still
 * imports. Repeats are dropped — a color used in ten rules is one swatch.
 */
const parseStylesheet = (text: string, fileName: string): Palette => {
  const colors: PaletteColor[] = [];
  const seen = new Set<string>();
  const push = (name: string, value: string) => {
    const rgb = parseCssColorValue(value.trim());
    if (!rgb) {
      return;
    }
    const key = rgb.join(",");
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    colors.push({ name: name || defaultName(colors.length), rgb });
  };

  for (const match of text.matchAll(CSS_DECLARATION)) {
    push(match[1].replace(/[-_]+/g, " ").trim(), match[2]);
  }
  if (colors.length === 0) {
    for (const match of text.matchAll(CSS_BARE_COLOR)) {
      push("", match[0]);
    }
  }
  return { name: paletteNameFromFile(fileName), colors };
};

/* ---------------------------------------------------------------------- JSON --- */

type JsonValue = unknown;

const colorFromJsonEntry = (entry: JsonValue, index: number): PaletteColor | null => {
  if (typeof entry === "string") {
    const rgb = parseHexColor(entry);
    return rgb ? { name: defaultName(index), rgb } : null;
  }
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const record = entry as Record<string, JsonValue>;
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : defaultName(index);

  const hex = record.hex ?? record.color ?? record.value;
  if (typeof hex === "string") {
    const rgb = parseHexColor(hex);
    if (rgb) {
      return { name, rgb };
    }
  }

  // Sketch stores 0..1 floats; most everything else stores 0..255.
  const channels = [record.red ?? record.r, record.green ?? record.g, record.blue ?? record.b];
  if (channels.every((channel) => typeof channel === "number")) {
    const [r, g, b] = channels as number[];
    const scaled = Math.max(r, g, b) <= 1 ? [r * 255, g * 255, b * 255] : [r, g, b];
    return { name, rgb: fromBytes(scaled[0], scaled[1], scaled[2]) };
  }

  if (Array.isArray(record.rgb) && record.rgb.length >= 3) {
    const [r, g, b] = record.rgb as number[];
    if ([r, g, b].every((channel) => typeof channel === "number")) {
      const scaled = Math.max(r, g, b) <= 1 ? [r * 255, g * 255, b * 255] : [r, g, b];
      return { name, rgb: fromBytes(scaled[0], scaled[1], scaled[2]) };
    }
  }
  return null;
};

/**
 * JSON, in whichever shape it arrived.
 *
 * Palette Studio's own code export, a Sketch `.sketchpalette`, a bare array of hex strings and a
 * plain `{ name: "#hex" }` map are all just lists of colors, and guessing between them is cheaper
 * for everyone than asking which one this is.
 */
const parseJsonPalette = (text: string, fileName: string): Palette => {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { name: paletteNameFromFile(fileName), colors: [] };
  }

  let name = paletteNameFromFile(fileName);
  let entries: JsonValue[] = [];

  if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, JsonValue>;
    if (typeof record.name === "string" && record.name.trim()) {
      name = record.name.trim();
    }
    const list = record.colors ?? record.palette ?? record.swatches;
    if (Array.isArray(list)) {
      entries = list;
    } else {
      // A `{ "brand-blue": "#0af" }` map: the keys are the names.
      return {
        name,
        colors: Object.entries(record)
          .map(([key, value], index) => {
            const color = colorFromJsonEntry(value, index);
            return color ? { ...color, name: key } : null;
          })
          .filter((color): color is PaletteColor => !!color),
      };
    }
  }

  return {
    name,
    colors: entries.map((entry, index) => colorFromJsonEntry(entry, index)).filter((color): color is PaletteColor => !!color),
  };
};

/* -------------------------------------------------------------------- Adobe --- */

/**
 * Photoshop's `.aco` swatch file.
 *
 * The file is two palettes back to back: a version 1 block with no names, then — since Photoshop 7 —
 * a version 2 block with the same colors and their names. Version 2 is read when it is there, so
 * the names the file went to the trouble of carrying are not thrown away.
 */
const parseAco = (bytes: Uint8Array, fileName: string): Palette => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const colors: PaletteColor[] = [];

  const readColor = (offset: number): [number, number, number] | null => {
    const space = view.getUint16(offset, false);
    const w = view.getUint16(offset + 2, false);
    const x = view.getUint16(offset + 4, false);
    const y = view.getUint16(offset + 6, false);
    const z = view.getUint16(offset + 8, false);
    if (space === 0) {
      return fromBytes(w / 257, x / 257, y / 257);
    }
    if (space === 1) {
      const converted = convert.hsv.rgb([(w / 65535) * 360, (x / 65535) * 100, (y / 65535) * 100]);
      return fromBytes(converted[0], converted[1], converted[2]);
    }
    if (space === 2) {
      // CMYK is stored inverted: 0 means full ink.
      const ink = [w, x, y, z].map((value) => ((65535 - value) / 65535) * 100);
      const converted = convert.cmyk.rgb([ink[0], ink[1], ink[2], ink[3]]);
      return fromBytes(converted[0], converted[1], converted[2]);
    }
    if (space === 7) {
      const signed = (value: number) => (value > 32767 ? value - 65536 : value);
      const converted = convert.lab.rgb([w / 100, signed(x) / 100, signed(y) / 100]);
      return fromBytes(converted[0], converted[1], converted[2]);
    }
    if (space === 8) {
      const gray = (w / 10000) * 100;
      const converted = convert.gray.rgb([gray]);
      return fromBytes(converted[0], converted[1], converted[2]);
    }
    return null;
  };

  const readBlock = (start: number) => {
    if (start + 4 > bytes.length) {
      return { colors: [] as PaletteColor[], end: bytes.length };
    }
    const version = view.getUint16(start, false);
    const count = view.getUint16(start + 2, false);
    const named = version === 2;
    const block: PaletteColor[] = [];
    let offset = start + 4;
    for (let index = 0; index < count; index += 1) {
      if (offset + 10 > bytes.length) {
        break;
      }
      const rgb = readColor(offset);
      offset += 10;
      let label = defaultName(index);
      if (named) {
        if (offset + 4 > bytes.length) {
          break;
        }
        // The stored length counts a trailing null that is not part of the name.
        const length = view.getUint32(offset, false);
        offset += 4;
        const characters: string[] = [];
        for (let unit = 0; unit + 1 < length && offset + 2 <= bytes.length; unit += 1) {
          const code = view.getUint16(offset, false);
          offset += 2;
          characters.push(String.fromCharCode(code));
        }
        offset += 2;
        const parsedName = characters.join("").replace(/\0/g, "").trim();
        label = parsedName || label;
      }
      if (rgb) {
        block.push({ name: label, rgb });
      }
    }
    return { colors: block, end: offset };
  };

  const first = readBlock(0);
  const second = first.end + 4 <= bytes.length ? readBlock(first.end) : null;
  colors.push(...(second && second.colors.length > 0 ? second.colors : first.colors));

  return { name: paletteNameFromFile(fileName), colors };
};

/**
 * Photoshop's `.act` color table: 256 raw RGB triples, with an optional trailer saying how many of
 * them are real. Without the trailer the unused entries are black padding, so trailing black is
 * trimmed rather than imported as sixty identical swatches.
 */
const parseAct = (bytes: Uint8Array, fileName: string): Palette => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let count = Math.min(256, Math.floor(bytes.length / 3));
  if (bytes.length >= 772) {
    const declared = view.getUint16(768, false);
    if (declared > 0 && declared <= 256) {
      count = declared;
    }
  } else {
    while (count > 1) {
      const offset = (count - 1) * 3;
      if (bytes[offset] !== 0 || bytes[offset + 1] !== 0 || bytes[offset + 2] !== 0) {
        break;
      }
      count -= 1;
    }
  }

  const colors: PaletteColor[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    colors.push({ name: defaultName(index), rgb: fromBytes(bytes[offset], bytes[offset + 1], bytes[offset + 2]) });
  }
  return { name: paletteNameFromFile(fileName), colors };
};

/* ---------------------------------------------------------------------- PAL --- */

/**
 * `.pal`, which is two unrelated formats wearing the same extension: the JASC text one that Paint
 * Shop Pro and every pixel-art tool writes, and Microsoft's RIFF binary one. The header says which.
 */
const parsePal = (bytes: Uint8Array, fileName: string): Palette => {
  const isRiff = bytes.length > 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const colors: PaletteColor[] = [];

  if (isRiff) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // "RIFF" size "PAL " "data" size version count, then four bytes per entry.
    const count = bytes.length >= 24 ? view.getUint16(22, true) : 0;
    for (let index = 0; index < count; index += 1) {
      const offset = 24 + index * 4;
      if (offset + 2 >= bytes.length) {
        break;
      }
      colors.push({ name: defaultName(index), rgb: fromBytes(bytes[offset], bytes[offset + 1], bytes[offset + 2]) });
    }
    return { name: paletteNameFromFile(fileName), colors };
  }

  for (const line of new TextDecoder().decode(bytes).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^jasc-pal$/i.test(trimmed) || /^\d+$/.test(trimmed) || /^[0-9a-f]{4}$/i.test(trimmed)) {
      continue;
    }
    const parts = trimmed.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) {
      continue;
    }
    const channels = parts.slice(0, 3).map(Number);
    if (channels.some((channel) => !Number.isFinite(channel))) {
      continue;
    }
    const label = parts.slice(3).join(" ").trim();
    colors.push({ name: label || defaultName(colors.length), rgb: fromBytes(channels[0], channels[1], channels[2]) });
  }
  return { name: paletteNameFromFile(fileName), colors };
};

/* ----------------------------------------------------------------- dispatch --- */

type Reader = (data: ArrayBuffer | Uint8Array | string, fileName: string) => Palette;

/**
 * The formats read by this module, keyed by extension. `palette.ts` owns the three the app also
 * writes; everything here is read-only.
 */
export const EXTRA_PALETTE_READERS: Record<string, Reader> = {
  aco: (data, fileName) => parseAco(toBytes(data), fileName),
  act: (data, fileName) => parseAct(toBytes(data), fileName),
  pal: (data, fileName) => parsePal(toBytes(data), fileName),
  sketchpalette: (data, fileName) => parseJsonPalette(toText(data), fileName),
  json: (data, fileName) => parseJsonPalette(toText(data), fileName),
  css: (data, fileName) => parseStylesheet(toText(data), fileName),
  scss: (data, fileName) => parseStylesheet(toText(data), fileName),
  less: (data, fileName) => parseStylesheet(toText(data), fileName),
  hex: (data, fileName) => parseHexList(toText(data), fileName),
  txt: (data, fileName) => parseHexList(toText(data), fileName),
};
