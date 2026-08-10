import {
  formatSelect,
  generateBaseColorField,
  generateBaseColorInput,
  generateCountInput,
  generateFormatSelect,
  generateHistoryBackButton,
  generateHistoryForwardButton,
  generateNameInput,
  generatePreviewName,
  generatePreviewStrip,
  generatePreviewSubtitle,
  generateStyleSelect,
  generateUseBaseToggle,
} from "./dom";
import { generatePaletteColors } from "./palette/generation";
import { createGeneratedPaletteName, nameColor, resolveNameFormat } from "./palette/naming";
import { getStyleLabel } from "./palette/style";
import type { Palette } from "./types";
import { t } from "./i18n";
import { getContrastColor, getHueFromHex, hexToRgb, rgbToHex } from "./utils/color";
import { createId } from "./utils/id";

type GeneratedPreview = {
  style: string;
  palette: Palette;
};

type GenerationContext = {
  count: number;
  nameFormat: string;
  baseHex: string;
  baseHue: number | undefined;
};

let generatedPreview: GeneratedPreview | null = null;
let generatedPreviewHistory: GeneratedPreview[] = [];
let generatedPreviewHistoryIndex = -1;
let previewTextLayoutFrame: number | null = null;
let hasPreviewResizeListener = false;

const resolveRawStyle = () => (generateStyleSelect?.value ?? "analogous").trim().toLowerCase();

const resolveStyle = () => {
  const style = resolveRawStyle();
  return style || "analogous";
};

const isEmptyStyle = (style: string) => style === "empty";

const resolveCount = () => {
  const rawCount = Number(generateCountInput?.value ?? 5);
  return Math.max(1, Math.min(Number.isFinite(rawCount) ? Math.round(rawCount) : 5, 16));
};

const resolveGenerationContext = (): GenerationContext => {
  const nameFormat = resolveNameFormat(generateFormatSelect?.value ?? formatSelect?.value ?? "pantone");
  const useBase = generateUseBaseToggle?.checked ?? false;
  const baseHex = useBase ? (generateBaseColorInput?.value ?? "").toUpperCase() : "";
  const baseHue = baseHex ? getHueFromHex(baseHex) : undefined;
  return {
    count: resolveCount(),
    nameFormat,
    baseHex,
    baseHue,
  };
};

const clonePaletteColors = (colors: Palette["colors"]) =>
  colors.map((color) => ({
    ...color,
    rgb: [...color.rgb] as [number, number, number],
  }));

const clonePalette = (palette: Palette): Palette => ({
  ...palette,
  colors: clonePaletteColors(palette.colors),
});

const cloneGeneratedPreview = (preview: GeneratedPreview): GeneratedPreview => ({
  style: preview.style,
  palette: clonePalette(preview.palette),
});

const canNavigateGeneratedPreviewBack = () => generatedPreviewHistoryIndex > 0;

const canNavigateGeneratedPreviewForward = () =>
  generatedPreviewHistoryIndex >= 0 && generatedPreviewHistoryIndex < generatedPreviewHistory.length - 1;

const syncGeneratedPreviewHistoryButtons = () => {
  if (generateHistoryBackButton) {
    generateHistoryBackButton.disabled = !canNavigateGeneratedPreviewBack();
  }
  if (generateHistoryForwardButton) {
    generateHistoryForwardButton.disabled = !canNavigateGeneratedPreviewForward();
  }
};

const pushGeneratedPreviewHistory = (preview: GeneratedPreview) => {
  if (generatedPreviewHistoryIndex < generatedPreviewHistory.length - 1) {
    generatedPreviewHistory = generatedPreviewHistory.slice(0, generatedPreviewHistoryIndex + 1);
  }
  generatedPreviewHistory.push(cloneGeneratedPreview(preview));
  generatedPreviewHistoryIndex = generatedPreviewHistory.length - 1;
  generatedPreview = cloneGeneratedPreview(generatedPreviewHistory[generatedPreviewHistoryIndex]);
  return generatedPreview;
};

const syncCurrentGeneratedPreviewHistoryEntry = () => {
  if (!generatedPreview || generatedPreviewHistoryIndex < 0 || generatedPreviewHistoryIndex >= generatedPreviewHistory.length) {
    return;
  }
  generatedPreviewHistory[generatedPreviewHistoryIndex] = cloneGeneratedPreview(generatedPreview);
};

const applyBaseColorToColors = (colors: Palette["colors"], baseHex: string) => {
  if (!baseHex || colors.length === 0) {
    return clonePaletteColors(colors);
  }
  const cloned = clonePaletteColors(colors);
  cloned[0] = {
    ...cloned[0],
    rgb: hexToRgb(baseHex),
  };
  return cloned;
};

const renamePaletteColors = (colors: Palette["colors"], nameFormat: string) =>
  colors.map((color, index) => {
    const hex = rgbToHex(color.rgb).toUpperCase();
    return {
      ...color,
      name: nameColor(hex, nameFormat, index),
    };
  });

const buildGeneratedPaletteName = (style: string, colors: Palette["colors"], baseHex: string, nameFormat: string) => {
  const mainHex = baseHex || (colors[0] ? rgbToHex(colors[0].rgb).toUpperCase() : "");
  if (isEmptyStyle(style) || !mainHex) {
    return t("generate.emptyName");
  }
  return createGeneratedPaletteName(style, mainHex, nameFormat);
};

const composeGeneratedPalette = (
  style: string,
  colors: Palette["colors"],
  nameFormat: string,
  baseHex: string,
  paletteId?: string,
) => {
  const colorsWithBase = applyBaseColorToColors(colors, baseHex);
  const renamedColors = renamePaletteColors(colorsWithBase, nameFormat);
  const generatedName = buildGeneratedPaletteName(style, renamedColors, baseHex, nameFormat);

  return {
    id: paletteId ?? createId(),
    name: generateNameInput?.value.trim() || generatedName,
    colors: renamedColors,
    lastModified: Date.now(),
  } as Palette;
};

const buildGeneratedPalette = (style: string) => {
  const { count, nameFormat, baseHex, baseHue } = resolveGenerationContext();
  const colors = isEmptyStyle(style) ? [] : generatePaletteColors(style, count, nameFormat, baseHue);
  return composeGeneratedPalette(style, colors, nameFormat, baseHex);
};

const syncGeneratedPreviewTextLayout = () => {
  if (!generatePreviewStrip) {
    return;
  }
  generatePreviewStrip.classList.remove("is-vertical-text");
  const swatches = Array.from(generatePreviewStrip.querySelectorAll<HTMLElement>(".generate-preview-swatch"));
  const shouldUseVerticalText = swatches.some((swatch) => {
    const hex = swatch.querySelector<HTMLElement>(".generate-preview-swatch-hex");
    if (!hex) {
      return false;
    }
    // If any color code overflows in horizontal mode, switch all swatches to vertical labels.
    return hex.scrollWidth > hex.clientWidth;
  });
  generatePreviewStrip.classList.toggle("is-vertical-text", shouldUseVerticalText);
};

const scheduleGeneratedPreviewTextLayout = () => {
  if (previewTextLayoutFrame !== null) {
    cancelAnimationFrame(previewTextLayoutFrame);
  }
  previewTextLayoutFrame = requestAnimationFrame(() => {
    previewTextLayoutFrame = null;
    syncGeneratedPreviewTextLayout();
  });
};

const ensurePreviewResizeListener = () => {
  if (hasPreviewResizeListener) {
    return;
  }
  hasPreviewResizeListener = true;
  window.addEventListener("resize", scheduleGeneratedPreviewTextLayout);
};

const renderGeneratedPreview = () => {
  if (!generatePreviewName || !generatePreviewSubtitle || !generatePreviewStrip || !generatedPreview) {
    return;
  }
  ensurePreviewResizeListener();

  const { style, palette } = generatedPreview;
  const customName = generateNameInput?.value.trim();
  generatePreviewName.textContent = customName || palette.name;
  generatePreviewSubtitle.textContent =
    palette.colors.length === 0
      ? t("generate.preview.empty")
      : `${getStyleLabel(style)} - ${t("palette.colors", { count: palette.colors.length })}`;

  generatePreviewStrip.textContent = "";
  if (palette.colors.length === 0) {
    const empty = document.createElement("p");
    empty.className = "generate-preview-empty";
    empty.textContent = t("generate.preview.empty");
    generatePreviewStrip.appendChild(empty);
    scheduleGeneratedPreviewTextLayout();
    return;
  }

  palette.colors.forEach((color) => {
    const swatch = document.createElement("div");
    swatch.className = "generate-preview-swatch";
    swatch.style.background = rgbToHex(color.rgb);
    swatch.style.color = getContrastColor(color.rgb);
    swatch.title = `${color.name} ${rgbToHex(color.rgb).toUpperCase()}`;

    const name = document.createElement("span");
    name.className = "generate-preview-swatch-name";
    name.textContent = color.name;

    const hex = document.createElement("small");
    hex.className = "generate-preview-swatch-hex";
    hex.textContent = rgbToHex(color.rgb).toUpperCase();

    swatch.append(name, hex);
    generatePreviewStrip.appendChild(swatch);
  });
  scheduleGeneratedPreviewTextLayout();
};

export const syncBaseColorState = () => {
  const useBase = generateUseBaseToggle?.checked ?? false;
  if (generateBaseColorInput) {
    generateBaseColorInput.disabled = !useBase;
  }
  generateBaseColorField?.classList.toggle("is-hidden", !useBase);
};

export const randomizeGeneratedPalettePreview = () => {
  const style = resolveStyle();
  syncBaseColorState();
  const preview = pushGeneratedPreviewHistory({
    style,
    palette: buildGeneratedPalette(style),
  });
  renderGeneratedPreview();
  syncGeneratedPreviewHistoryButtons();
  return preview.palette;
};

export const startGeneratedPalettePreviewSession = () => {
  generatedPreviewHistory = [];
  generatedPreviewHistoryIndex = -1;
  generatedPreview = null;
  syncGeneratedPreviewHistoryButtons();
  return randomizeGeneratedPalettePreview();
};

export const syncGeneratedPalettePreviewFormat = () => {
  if (!generatedPreview) {
    return randomizeGeneratedPalettePreview();
  }
  const style = generatedPreview.style;
  const { nameFormat, baseHex } = resolveGenerationContext();
  generatedPreview = {
    style,
    palette: composeGeneratedPalette(style, generatedPreview.palette.colors, nameFormat, baseHex, generatedPreview.palette.id),
  };
  syncCurrentGeneratedPreviewHistoryEntry();
  renderGeneratedPreview();
  syncGeneratedPreviewHistoryButtons();
  return generatedPreview.palette;
};

export const syncGeneratedPalettePreviewCount = () => {
  if (!generatedPreview) {
    return randomizeGeneratedPalettePreview();
  }
  const style = generatedPreview.style;
  const { count, nameFormat, baseHex, baseHue } = resolveGenerationContext();
  if (isEmptyStyle(style)) {
    generatedPreview = {
      style,
      palette: composeGeneratedPalette(style, [], nameFormat, baseHex, generatedPreview.palette.id),
    };
    syncCurrentGeneratedPreviewHistoryEntry();
    renderGeneratedPreview();
    syncGeneratedPreviewHistoryButtons();
    return generatedPreview.palette;
  }

  let nextColors = clonePaletteColors(generatedPreview.palette.colors).slice(0, count);
  if (nextColors.length < count) {
    const generated = generatePaletteColors(style, count, nameFormat, baseHue);
    nextColors = [...nextColors, ...clonePaletteColors(generated.slice(nextColors.length))];
  }

  generatedPreview = {
    style,
    palette: composeGeneratedPalette(style, nextColors, nameFormat, baseHex, generatedPreview.palette.id),
  };
  syncCurrentGeneratedPreviewHistoryEntry();
  renderGeneratedPreview();
  syncGeneratedPreviewHistoryButtons();
  return generatedPreview.palette;
};

export const syncGeneratedPalettePreviewBaseColor = () => {
  if (!generatedPreview) {
    return randomizeGeneratedPalettePreview();
  }
  const style = generatedPreview.style;
  const { nameFormat, baseHex } = resolveGenerationContext();
  generatedPreview = {
    style,
    palette: composeGeneratedPalette(style, generatedPreview.palette.colors, nameFormat, baseHex, generatedPreview.palette.id),
  };
  syncCurrentGeneratedPreviewHistoryEntry();
  renderGeneratedPreview();
  syncGeneratedPreviewHistoryButtons();
  return generatedPreview.palette;
};

export const syncGeneratedPalettePreviewName = () => {
  if (!generatedPreview) {
    return;
  }
  renderGeneratedPreview();
  syncGeneratedPreviewHistoryButtons();
};

export const showPreviousGeneratedPalettePreview = () => {
  if (!canNavigateGeneratedPreviewBack()) {
    syncGeneratedPreviewHistoryButtons();
    return null;
  }
  generatedPreviewHistoryIndex -= 1;
  generatedPreview = cloneGeneratedPreview(generatedPreviewHistory[generatedPreviewHistoryIndex]);
  renderGeneratedPreview();
  syncGeneratedPreviewHistoryButtons();
  return generatedPreview.palette;
};

export const showNextGeneratedPalettePreview = () => {
  if (!canNavigateGeneratedPreviewForward()) {
    syncGeneratedPreviewHistoryButtons();
    return null;
  }
  generatedPreviewHistoryIndex += 1;
  generatedPreview = cloneGeneratedPreview(generatedPreviewHistory[generatedPreviewHistoryIndex]);
  renderGeneratedPreview();
  syncGeneratedPreviewHistoryButtons();
  return generatedPreview.palette;
};

export const saveGeneratedPaletteFromPreview = () => {
  const preview = generatedPreview?.palette ?? randomizeGeneratedPalettePreview();
  return {
    ...preview,
    id: createId(),
    name: generateNameInput?.value.trim() || preview.name,
    colors: preview.colors.map((color) => ({ ...color, id: createId() })),
    lastModified: Date.now(),
  } as Palette;
};

syncGeneratedPreviewHistoryButtons();

