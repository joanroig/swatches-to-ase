import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatColorValue,
  getColorMetrics,
  getContrastColor,
  getHueFromHex,
  getRgb255,
  hexToRgb,
  hslToRgb,
  normalizeHex,
  rgbToHex,
} from "../../web/src/app/utils/color.js";
import { clamp, normalizeHue, randomBetween } from "../../web/src/app/utils/math.js";
import { createId } from "../../web/src/app/utils/id.js";
import { sanitizeFileName, toCssVarName, toTitleCase } from "../../web/src/app/utils/text.js";
import type { PaletteColor } from "../../web/src/app/types.js";

test("color helpers normalize and convert hex/rgb values", () => {
  assert.equal(normalizeHex("00ff00"), "#00ff00");
  assert.equal(rgbToHex([1, 0, 0]), "#ff0000");
  assert.deepEqual(hexToRgb("#0000ff"), [0, 0, 1]);
  assert.deepEqual(getRgb255([0.25, 0.5, 0.75]), [64, 128, 191]);
});

test("formatColorValue supports multiple notations", () => {
  const color: PaletteColor = {
    id: "color-1",
    name: "Bright Red",
    rgb: [1, 0, 0],
  };
  assert.equal(formatColorValue(color, "rgb"), "255, 0, 0");
  assert.equal(formatColorValue(color, "name"), "Bright Red");
  assert.equal(formatColorValue(color, "hex"), "#FF0000");
  assert.ok(formatColorValue(color, "hsl").includes("°"));
  assert.ok(formatColorValue(color, "lab").startsWith("L"));
});

test("color utilities expose derived metrics and contrast", () => {
  assert.equal(getHueFromHex("#ff0000"), 0);
  assert.equal(getContrastColor([1, 1, 1]), "#0f172a");
  assert.equal(getContrastColor([0, 0, 0]), "#f8fafc");

  const metrics = getColorMetrics([0.2, 0.4, 0.6]);
  assert.equal(metrics.r, 51);
  assert.equal(metrics.g, 102);
  assert.equal(metrics.b, 153);
  assert.equal(metrics.hsb.length, 3);
  assert.equal(metrics.hsl.length, 3);
  assert.equal(metrics.cmyk.length, 4);
  assert.equal(metrics.lab.length, 3);
});

test("hslToRgb returns normalized RGB channels", () => {
  const rgb = hslToRgb(0, 1, 0.5);
  assert.ok(rgb[0] > 0.99);
  assert.ok(rgb[1] < 0.01);
  assert.ok(rgb[2] < 0.01);
});

test("math utilities clamp and wrap values", () => {
  assert.equal(clamp(-1), 0);
  assert.equal(clamp(1.5), 1);
  assert.equal(normalizeHue(-30), 330);
  assert.equal(normalizeHue(390), 30);
});

test("randomBetween respects bounds", () => {
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(randomBetween(10, 20), 10);
    Math.random = () => 1;
    assert.equal(randomBetween(10, 20), 20);
  } finally {
    Math.random = originalRandom;
  }
});

test("text helpers format palette labels", () => {
  assert.equal(toTitleCase("warm-cold"), "Warm Cold");
  assert.equal(sanitizeFileName("  Neon & Dust  "), "Neon-Dust");
  assert.equal(sanitizeFileName("***"), "palette");
  assert.equal(toCssVarName("123 red", 0), "color-123-red");
  assert.equal(toCssVarName("Accent", 3), "accent");
});

test("createId returns a usable identifier", () => {
  const id = createId();
  assert.equal(typeof id, "string");
  assert.ok(id.length > 0);
  assert.ok(/^([0-9a-f-]{36}|palette-)/i.test(id));
});
