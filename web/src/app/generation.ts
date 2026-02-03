import {
  formatSelect,
  generateBaseColorInput,
  generateCountInput,
  generateFormatSelect,
  generateNameInput,
  generateStyleSelect,
  generateUseBaseToggle,
} from "./dom";
import { generatePaletteColors } from "./palette/generation";
import { createGeneratedPaletteName, resolveNameFormat } from "./palette/naming";
import type { Palette } from "./types";
import { t } from "./i18n";
import { getHueFromHex, rgbToHex } from "./utils/color";
import { createId } from "./utils/id";

export const syncBaseColorState = () => {
  if (generateBaseColorInput) {
    generateBaseColorInput.disabled = !(generateUseBaseToggle?.checked ?? false);
  }
};

export const createGeneratedPalette = (isEmpty: boolean) => {
  const style = generateStyleSelect?.value ?? "analogous";
  const rawCount = Number(generateCountInput?.value ?? 5);
  const count = Math.max(1, Math.min(Number.isFinite(rawCount) ? Math.round(rawCount) : 5, 16));
  const nameFormat = resolveNameFormat(generateFormatSelect?.value ?? formatSelect?.value ?? "pantone");
  const useBase = generateUseBaseToggle?.checked ?? false;
  const baseHex = useBase ? generateBaseColorInput?.value : null;
  const baseHue = baseHex ? getHueFromHex(baseHex) : undefined;
  const colors = isEmpty ? [] : generatePaletteColors(style, count, nameFormat, baseHue);
  const mainHex = baseHex ?? (colors[0] ? rgbToHex(colors[0].rgb).toUpperCase() : "");
  const generatedName = isEmpty || !mainHex ? t("generate.emptyName") : createGeneratedPaletteName(style, mainHex, nameFormat);
  return {
    id: createId(),
    name: generateNameInput?.value.trim() || generatedName,
    colors,
  } as Palette;
};
