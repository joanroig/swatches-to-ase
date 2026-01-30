import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createGeneratedPaletteName,
  nameColor,
  resolveNameFormat,
} from "../../web/src/app/palette/naming.js";
import { generatePaletteColors } from "../../web/src/app/palette/generation.js";
import { getStyleLabel } from "../../web/src/app/palette/style.js";

test("resolveNameFormat falls back to pantone", () => {
  assert.equal(resolveNameFormat(null), "pantone");
  assert.equal(resolveNameFormat("x11"), "x11");
  assert.equal(resolveNameFormat("unsupported"), "pantone");
});

test("nameColor returns a readable name", () => {
  const result = nameColor("#ff0000", "pantone", 0);
  assert.ok(result.length > 0);
});

test("createGeneratedPaletteName uses style label", () => {
  const name = createGeneratedPaletteName("warm-cold", "#00ff00", "pantone");
  assert.ok(name.startsWith(`${getStyleLabel("warm-cold")} `));
});

test("generatePaletteColors returns stable structure", () => {
  const originalRandom = Math.random;
  let randomIndex = 0;
  const randomValues = [0.12, 0.34, 0.56, 0.78, 0.9];

  try {
    Math.random = () => {
      const value = randomValues[randomIndex % randomValues.length] ?? 0.5;
      randomIndex += 1;
      return value;
    };

    const colors = generatePaletteColors("analogous", 4, "pantone", 210);
    assert.equal(colors.length, 4);
    assert.equal(new Set(colors.map((color) => color.id)).size, 4);
    for (const color of colors) {
      assert.ok(color.name.length > 0);
      color.rgb.forEach((channel) => {
        assert.ok(channel >= 0 && channel <= 1);
      });
    }
  } finally {
    Math.random = originalRandom;
  }
});
