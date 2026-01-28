import convert from "color-convert";
import namer from "color-namer/dist/color-namer.js";
import { readSwatchesFile } from "procreate-swatches";

import { AseColor, encodeAse } from "./ase.js";

export type ConvertOptions = {
  colorNameFormat: string;
  addBlackWhite: boolean;
};

const VALID_FORMATS = [
  "roygbiv",
  "basic",
  "html",
  "x11",
  "pantone",
  "ntc",
];

const resolveFormat = (format: string) => {
  const normalized = format?.toLowerCase().trim();
  const isValid = VALID_FORMATS.includes(normalized);
  if (!isValid) {
    throw new Error(
      `Invalid color name format! Use one of: ${VALID_FORMATS.join(", ")}`
    );
  }
  return normalized;
};

export const convertSwatchesToAse = async (
  data: ArrayBuffer | Uint8Array,
  options: ConvertOptions
) => {
  const colorNameFormat = resolveFormat(options.colorNameFormat);
  const result = await readSwatchesFile(data);
  const colors: AseColor[] = [];

  if (options.addBlackWhite) {
    colors.push(
      {
        name: "black",
        rgb: [0, 0, 0],
        type: "global",
      },
      {
        name: "white",
        rgb: [1, 1, 1],
        type: "global",
      }
    );
  }

  const entries = Array.isArray(result?.colors) ? result.colors : [];
  for (const entry of entries) {
    if (!entry?.[0]) {
      continue;
    }
    const rgb = convert.hsv.rgb(entry[0]);
    const normalized: [number, number, number] = [
      rgb[0] / 255,
      rgb[1] / 255,
      rgb[2] / 255,
    ];
    const hex = `#${convert.rgb.hex(rgb)}`;
    const named = namer(hex) as Record<string, Array<{ name: string }>>;
    const list = named[colorNameFormat];
    if (!list?.length) {
      throw new Error(
        `No color names available for format "${colorNameFormat}".`
      );
    }
    const name = list[0].name;
    colors.push({
      name,
      rgb: normalized,
      type: "global",
    });
  }

  return encodeAse(colors);
};

export const getValidFormats = () => [...VALID_FORMATS];
