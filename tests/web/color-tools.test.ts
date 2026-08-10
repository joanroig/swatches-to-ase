import assert from "node:assert/strict";
import test from "node:test";

import { BLACK, WHITE, contrastRatio, gradeContrast, preferredTextColor, relativeLuminance } from "../../web/src/app/color/contrast.js";
import { buildShades } from "../../web/src/app/color/shades.js";
import { hexToRgb, rgbToHex } from "../../web/src/app/utils/color.js";

test("relative luminance matches the WCAG reference points", () => {
  assert.equal(relativeLuminance(WHITE), 1);
  assert.equal(relativeLuminance(BLACK), 0);
  // sRGB mid grey is a well-known ~0.2159.
  assert.ok(Math.abs(relativeLuminance(hexToRgb("#808080")) - 0.2159) < 0.001);
});

test("contrast ratio spans 1:1 to 21:1", () => {
  assert.equal(Number(contrastRatio(BLACK, WHITE).toFixed(0)), 21);
  assert.equal(contrastRatio(WHITE, WHITE), 1);
  // Symmetric, whichever way round the pair is given.
  assert.equal(contrastRatio(BLACK, WHITE), contrastRatio(WHITE, BLACK));
});

test("contrast grades follow the WCAG thresholds", () => {
  assert.equal(gradeContrast(21), "AAA");
  assert.equal(gradeContrast(7), "AAA");
  assert.equal(gradeContrast(4.5), "AA");
  assert.equal(gradeContrast(3), "AA Large");
  assert.equal(gradeContrast(2.99), "Fail");
});

test("preferred text color picks the more readable option", () => {
  assert.deepEqual(preferredTextColor(hexToRgb("#0c0f05")), WHITE);
  assert.deepEqual(preferredTextColor(hexToRgb("#e6c79c")), BLACK);
});

test("shades sweep lightness while holding the hue", () => {
  const shades = buildShades(hexToRgb("#6fd08c"), 11);
  assert.equal(shades.length, 11);
  // Lightness descends monotonically from tint to shade.
  for (let index = 1; index < shades.length; index += 1) {
    assert.ok(shades[index].lightness < shades[index - 1].lightness);
  }
  // Exactly one entry is flagged as the source anchor.
  assert.equal(shades.filter((shade) => shade.isSource).length, 1);
});

test("shades stay on the source hue", () => {
  const source = hexToRgb("#7b9ea8");
  buildShades(source, 7).forEach((shade) => {
    const hex = rgbToHex(shade.rgb);
    assert.match(hex, /^#[0-9a-f]{6}$/);
  });
  // The mid shade should be recognisably the same family, not a grey.
  const mid = buildShades(source, 7)[3];
  const [r, , b] = mid.rgb;
  assert.ok(b > r, "expected the blue-leaning source hue to be preserved");
});
