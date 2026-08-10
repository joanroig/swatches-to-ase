import { formatSelect } from "../dom";
import { rgbToHex } from "../utils/color";
import { nameColor, resolveNameFormat } from "./naming";

/** The colour-name format currently selected in Settings, with an explicit override for callers. */
export const resolveActiveNameFormat = (value?: string) => resolveNameFormat(value ?? formatSelect?.value ?? "pantone");

export const getColorName = (rgb: [number, number, number], format: string, index: number) =>
  nameColor(rgbToHex(rgb).toUpperCase(), format, index);
