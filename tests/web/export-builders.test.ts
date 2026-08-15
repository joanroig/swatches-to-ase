import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPaletteSheet, buildSvgExport } from "../../web/src/app/export/builders.js";
import type { Palette } from "../../web/src/app/types.js";

const palette: Palette = {
  id: "palette-a",
  name: "Warm & Bright",
  colors: [
    { id: "c1", name: "Red", rgb: [1, 0, 0] },
    { id: "c2", name: "Paper", rgb: [1, 1, 1] },
  ],
};

const wide: Palette = {
  id: "palette-wide",
  name: "Wide",
  colors: Array.from({ length: 11 }, (_, index) => ({ id: `c${index}`, name: `Color ${index}`, rgb: [0, 0, 0] as [number, number, number] })),
};

test("the sheet lays a small palette out as a single row", () => {
  const sheet = buildPaletteSheet(palette);
  assert.equal(sheet.columns, 2);
  assert.equal(sheet.rows, 1);
  assert.equal(sheet.cells[0].y, sheet.cells[1].y);
  assert.ok(sheet.cells[1].x > sheet.cells[0].x);
});

/* Thirty swatches in one row is a picture nothing can display. */
test("the sheet wraps a long palette into a grid", () => {
  const sheet = buildPaletteSheet(wide);
  assert.equal(sheet.columns, 8);
  assert.equal(sheet.rows, 2);
  assert.equal(sheet.cells[8].x, sheet.cells[0].x);
  assert.ok(sheet.cells[8].y > sheet.cells[0].y);
});

test("each cell carries the values that get printed on it", () => {
  const sheet = buildPaletteSheet(palette);
  assert.equal(sheet.cells[0].hex, "#FF0000");
  assert.equal(sheet.cells[0].rgb, "255, 0, 0");
  // Dark ink on a white swatch, light ink on a saturated red one.
  assert.equal(sheet.cells[1].contrast, "#0f172a");
  assert.notEqual(sheet.cells[0].contrast, sheet.cells[1].contrast);
});

test("the svg export prints hex, name and rgb next to every swatch", () => {
  const svg = buildSvgExport(palette, { subtitle: "2 colors", footer: "Generated from Palette Studio" });
  assert.match(svg, /<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(svg.includes(">#FF0000<"));
  assert.ok(svg.includes(">255, 0, 0<"));
  assert.ok(svg.includes(">Red<"));
  assert.ok(svg.includes(">2 colors<"));
  assert.ok(svg.includes(">Generated from Palette Studio<"));
});

/* An ampersand in a palette name used to be enough to produce an SVG no renderer would open. */
test("the svg export escapes names", () => {
  const svg = buildSvgExport(palette);
  assert.ok(svg.includes("Warm &amp; Bright"));
  assert.ok(!svg.includes("Warm & Bright"));
});
