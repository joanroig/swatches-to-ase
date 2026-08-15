import type { Palette } from "../types";
import { getContrastColor, getRgb255, rgbToHex } from "../utils/color";
import { escapeMarkup, toCssVarName, truncateLabel } from "../utils/text";

export const buildCssExport = (palette: Palette) => {
  const lines = [":root {"];
  palette.colors.forEach((color, index) => {
    const varName = toCssVarName(color.name, index);
    lines.push(`  --${varName}: ${rgbToHex(color.rgb).toUpperCase()};`);
  });
  lines.push("}");
  return lines.join("\n");
};

export const buildTailwindExport = (palette: Palette) => {
  const lines = ["module.exports = {", "  theme: {", "    extend: {", "      colors: {"];
  palette.colors.forEach((color, index) => {
    const varName = toCssVarName(color.name, index);
    lines.push(`        "${varName}": "${rgbToHex(color.rgb).toUpperCase()}",`);
  });
  lines.push("      },");
  lines.push("    },");
  lines.push("  },");
  lines.push("};");
  return lines.join("\n");
};

export const buildCodeExport = (palette: Palette) =>
  JSON.stringify(
    palette.colors.map((color) => ({
      name: color.name,
      hex: rgbToHex(color.rgb).toUpperCase(),
      rgb: getRgb255(color.rgb),
    })),
    null,
    2,
  );

export const buildEmbedExport = (palette: Palette) => {
  const swatches = palette.colors
    .map((color) => `<span class="swatch" style="background:${rgbToHex(color.rgb).toUpperCase()}"></span>`)
    .join("");
  return ['<div class="palette" style="display:flex;gap:4px;">', swatches, "</div>"].join("");
};

/*
 * The shared geometry of the picture exports.
 *
 * PNG, SVG and print each drew their own bare strip of color, which looked fine and told you
 * nothing — a palette you cannot read a hex off is not one you can hand to anyone. The three of them
 * now lay out from this single description, so they stay the same picture and gain the labels once.
 */
const SHEET = {
  padding: 40,
  headerHeight: 64,
  swatchWidth: 180,
  swatchHeight: 160,
  labelHeight: 54,
  gap: 16,
  footerHeight: 28,
  radius: 14,
  /* Past this a palette lays out as a grid, rather than as one strip thirty swatches wide. */
  maxColumns: 8,
  background: "#ffffff",
  titleColor: "#0f172a",
  nameColor: "#334155",
  mutedColor: "#64748b",
  /* Near-white swatches would otherwise have no edge at all against the sheet. */
  strokeColor: "rgba(15, 23, 42, 0.14)",
  fontFamily: "Arial, Helvetica, sans-serif",
} as const;

export type PaletteSheetCell = {
  x: number;
  y: number;
  hex: string;
  name: string;
  rgb: string;
  /** Black or white, whichever the hex printed inside the swatch can be read against. */
  contrast: string;
};

export type PaletteSheetLabels = {
  /** Usually the color count. Sits opposite the palette name in the header. */
  subtitle?: string;
  footer?: string;
};

export const buildPaletteSheet = (palette: Palette, labels: PaletteSheetLabels = {}) => {
  const count = Math.max(1, palette.colors.length);
  const columns = Math.min(count, SHEET.maxColumns);
  const rows = Math.ceil(count / columns);
  const cellHeight = SHEET.swatchHeight + SHEET.labelHeight;
  const width = SHEET.padding * 2 + columns * SHEET.swatchWidth + (columns - 1) * SHEET.gap;
  const height =
    SHEET.padding * 2 + SHEET.headerHeight + rows * cellHeight + (rows - 1) * SHEET.gap + (labels.footer ? SHEET.footerHeight : 0);

  const cells: PaletteSheetCell[] = palette.colors.map((color, index) => {
    const [r, g, b] = getRgb255(color.rgb);
    return {
      x: SHEET.padding + (index % columns) * (SHEET.swatchWidth + SHEET.gap),
      y: SHEET.padding + SHEET.headerHeight + Math.floor(index / columns) * (cellHeight + SHEET.gap),
      hex: rgbToHex(color.rgb).toUpperCase(),
      name: truncateLabel(color.name, 25),
      rgb: `${r}, ${g}, ${b}`,
      contrast: getContrastColor(color.rgb),
    };
  });

  return {
    ...SHEET,
    width,
    height,
    columns,
    rows,
    cells,
    title: truncateLabel(palette.name, Math.max(20, Math.floor(width / 16))),
    subtitle: labels.subtitle ?? "",
    footer: labels.footer ?? "",
    /* Baselines, so the canvas and the SVG put the same text in the same place. */
    headerBaseline: SHEET.padding + 30,
    footerBaseline: height - SHEET.padding - 6,
  };
};

export type PaletteSheet = ReturnType<typeof buildPaletteSheet>;

export const buildSvgExport = (palette: Palette, labels: PaletteSheetLabels = {}) => {
  const sheet = buildPaletteSheet(palette, labels);
  const text = (value: string, x: number, y: number, size: number, fill: string, weight = "400", anchor = "middle") =>
    `<text x="${x}" y="${y}" font-family="${sheet.fontFamily}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeMarkup(value)}</text>`;

  const parts = [`<rect x="0" y="0" width="${sheet.width}" height="${sheet.height}" fill="${sheet.background}" />`];
  parts.push(text(sheet.title, sheet.padding, sheet.headerBaseline, 26, sheet.titleColor, "700", "start"));
  if (sheet.subtitle) {
    parts.push(text(sheet.subtitle, sheet.width - sheet.padding, sheet.headerBaseline, 14, sheet.mutedColor, "400", "end"));
  }

  sheet.cells.forEach((cell) => {
    const center = cell.x + sheet.swatchWidth / 2;
    parts.push(
      `<rect x="${cell.x}" y="${cell.y}" width="${sheet.swatchWidth}" height="${sheet.swatchHeight}" rx="${sheet.radius}" fill="${cell.hex}" stroke="${sheet.strokeColor}" stroke-width="1" />`,
      text(cell.hex, center, cell.y + sheet.swatchHeight - 18, 16, cell.contrast, "700"),
      text(cell.name, center, cell.y + sheet.swatchHeight + 22, 13, sheet.nameColor, "600"),
      text(cell.rgb, center, cell.y + sheet.swatchHeight + 41, 11, sheet.mutedColor),
    );
  });

  if (sheet.footer) {
    parts.push(text(sheet.footer, sheet.width / 2, sheet.footerBaseline, 12, sheet.mutedColor));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.width}" height="${sheet.height}" viewBox="0 0 ${sheet.width} ${sheet.height}">${parts.join("")}</svg>`;
};
