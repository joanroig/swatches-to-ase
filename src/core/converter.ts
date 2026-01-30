import {
  exportPaletteToAse,
  getValidFormats,
  readPaletteFile,
} from "./palette.js";

export type ConvertOptions = {
  colorNameFormat: string;
  addBlackWhite: boolean;
};

export const convertSwatchesToAse = async (
  data: ArrayBuffer | Uint8Array,
  options: ConvertOptions
) => {
  const palette = await readPaletteFile(data, "palette.swatches", options);
  return exportPaletteToAse(palette);
};

export { getValidFormats };
