import namer from "color-namer/dist/color-namer.js";

import { VALID_NAME_FORMATS } from "../config";
import { getStyleLabel } from "./style";

export const resolveNameFormat = (format: string | null | undefined) => {
  const normalized = format?.toLowerCase().trim();
  if (!normalized) {
    return "pantone";
  }
  return VALID_NAME_FORMATS.includes(normalized) ? normalized : "pantone";
};

export const nameColor = (hex: string, format: string, fallbackIndex: number) => {
  const normalized = resolveNameFormat(format);
  const named = namer(hex) as Record<string, Array<{ name: string }>>;
  const list = named?.[normalized];
  if (!list?.length) {
    return `Color ${fallbackIndex + 1}`;
  }
  return list[0].name;
};

export const createGeneratedPaletteName = (
  style: string,
  mainHex: string,
  nameFormat: string
) => `${getStyleLabel(style)} ${nameColor(mainHex, nameFormat, 0)}`;
