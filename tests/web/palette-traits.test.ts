import assert from "node:assert/strict";
import test from "node:test";

import { colorFamilyOf, colorFamiliesOf, stylesOf } from "../../web/src/app/cloud/palette-traits.js";
import { hexToRgb } from "../../web/src/app/utils/color.js";

const palette = (...hexes: string[]) => hexes.map((hex) => ({ rgb: hexToRgb(hex) }));

test("a colour lands in the family a person would name", () => {
  assert.equal(colorFamilyOf(hexToRgb("#e11d48")), "red");
  assert.equal(colorFamilyOf(hexToRgb("#f97316")), "orange");
  assert.equal(colorFamilyOf(hexToRgb("#facc15")), "yellow");
  assert.equal(colorFamilyOf(hexToRgb("#22c55e")), "green");
  assert.equal(colorFamilyOf(hexToRgb("#14b8a6")), "turquoise");
  assert.equal(colorFamilyOf(hexToRgb("#3b82f6")), "blue");
  assert.equal(colorFamilyOf(hexToRgb("#8b5cf6")), "purple");
  assert.equal(colorFamilyOf(hexToRgb("#ec4899")), "pink");
});

test("red wraps the top of the wheel rather than splitting in two", () => {
  assert.equal(colorFamilyOf(hexToRgb("#ff0505")), "red");
  assert.equal(colorFamilyOf(hexToRgb("#ff0533")), "red");
});

test("neutrals are decided before the hue wheel is consulted", () => {
  assert.equal(colorFamilyOf(hexToRgb("#000000")), "black");
  assert.equal(colorFamilyOf(hexToRgb("#111318")), "black");
  assert.equal(colorFamilyOf(hexToRgb("#ffffff")), "white");
  assert.equal(colorFamilyOf(hexToRgb("#f7f8fa")), "white");
  assert.equal(colorFamilyOf(hexToRgb("#8a8f98")), "grey");
});

/* Brown is a dark, muted orange. Someone filtering for orange does not mean chocolate. */
test("brown is separated from orange by lightness and saturation", () => {
  assert.equal(colorFamilyOf(hexToRgb("#6b3f10")), "brown");
  assert.equal(colorFamilyOf(hexToRgb("#8b5a2b")), "brown");
  assert.equal(colorFamilyOf(hexToRgb("#f97316")), "orange");
});

test("a palette reports every family it contains", () => {
  const families = colorFamiliesOf(palette("#e11d48", "#3b82f6", "#000000"));
  assert.deepEqual([...families].sort(), ["black", "blue", "red"]);
});

test("warm and cold follow the majority, not a single accent", () => {
  assert.ok(stylesOf(palette("#e11d48", "#f97316", "#facc15", "#3b82f6")).has("warm"));
  assert.ok(!stylesOf(palette("#e11d48", "#f97316", "#facc15", "#3b82f6")).has("cold"));
  assert.ok(stylesOf(palette("#0ea5e9", "#3b82f6", "#8b5cf6", "#f97316")).has("cold"));
});

test("dark and pastel are read off lightness", () => {
  assert.ok(stylesOf(palette("#0b1120", "#111827", "#1f2937")).has("dark"));
  assert.ok(!stylesOf(palette("#0b1120", "#111827", "#1f2937")).has("pastel"));
  assert.ok(stylesOf(palette("#fbcfe8", "#bfdbfe", "#bbf7d0")).has("pastel"));
});

test("bright needs saturation, not merely a light palette", () => {
  assert.ok(stylesOf(palette("#ff0000", "#00b3ff", "#ffd400")).has("bright"));
  assert.ok(!stylesOf(palette("#cdd0d6", "#b8bcc4", "#a2a7b1")).has("bright"));
});

test("vintage is muted and mid-toned, which is not the same as grey", () => {
  assert.ok(stylesOf(palette("#a3866a", "#8a9a7b", "#b0907e")).has("vintage"));
  assert.ok(!stylesOf(palette("#ff0000", "#00ff00", "#0000ff")).has("vintage"));
});

/* Averaging hues across the 360° seam is meaningless, so this is measured pairwise. */
test("monochromatic holds across the red seam", () => {
  assert.ok(stylesOf(palette("#ff1a1a", "#c31414", "#7d0d0d")).has("monochromatic"));
  assert.ok(!stylesOf(palette("#ff1a1a", "#14c3a0")).has("monochromatic"));
});

test("a gradient runs one way in even steps", () => {
  assert.ok(stylesOf(palette("#0b3d2e", "#14684d", "#1f9370", "#2bbe93")).has("gradient"));
  // Doubles back, so it is a set of colours rather than a ramp.
  assert.ok(!stylesOf(palette("#0b3d2e", "#2bbe93", "#14684d")).has("gradient"));
  // Two colours are a pair, not a ramp.
  assert.ok(!stylesOf(palette("#0b3d2e", "#2bbe93")).has("gradient"));
});

test("an empty palette qualifies for nothing", () => {
  assert.equal(stylesOf([]).size, 0);
});
