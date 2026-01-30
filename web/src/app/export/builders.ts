import type { Palette } from "../types";
import { getRgb255, rgbToHex } from "../utils/color";
import { toCssVarName } from "../utils/text";

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
  const lines = [
    "module.exports = {",
    "  theme: {",
    "    extend: {",
    "      colors: {",
  ];
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
    2
  );

export const buildEmbedExport = (palette: Palette) => {
  const swatches = palette.colors
    .map(
      (color) =>
        `<span class="swatch" style="background:${rgbToHex(
          color.rgb
        ).toUpperCase()}"></span>`
    )
    .join("");
  return [
    "<div class=\"palette\" style=\"display:flex;gap:4px;\">",
    swatches,
    "</div>",
  ].join("");
};

export const buildSvgExport = (palette: Palette) => {
  const width = Math.max(1, palette.colors.length) * 120;
  const height = 120;
  const rects = palette.colors
    .map((color, index) => {
      const x = index * 120;
      return `<rect x="${x}" y="0" width="120" height="${height}" fill="${rgbToHex(
        color.rgb
      ).toUpperCase()}" />`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects}</svg>`;
};
