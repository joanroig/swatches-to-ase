import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeSimilarWeighted, quantize, quantizeWeighted, sortByLightness, type Rgb255 } from "../../web/src/app/image/quantize.js";

/** What the sampler does with a decoded image, without needing a canvas to decode one. */
const extract = (pixels: Rgb255[], count: number, similarity: number) => {
  const merged = mergeSimilarWeighted(quantizeWeighted(pixels, 64), similarity);
  return sortByLightness(merged.slice(0, Math.max(0, count)).map((entry) => entry.rgb));
};

const repeat = (colors: Rgb255[], total: number): Rgb255[] => Array.from({ length: total }, (_, index) => colors[index % colors.length]);

/** Four flat colors, like a picture of four painted walls. */
const FLAT: Rgb255[] = [
  [224, 199, 156],
  [12, 15, 5],
  [111, 208, 140],
  [123, 158, 168],
];

/** A smooth sky with three small accents: mostly near-duplicates, like a photograph. */
const photo = (): Rgb255[] => {
  const pixels: Rgb255[] = [];
  for (let index = 0; index < 4000; index += 1) {
    const ramp = index / 4000;
    pixels.push([Math.round(90 + 90 * ramp), Math.round(140 + 70 * ramp), Math.round(200 + 40 * ramp)]);
  }
  pixels.push(...repeat([[200, 40, 30]], 400));
  pixels.push(...repeat([[20, 90, 40]], 200));
  pixels.push(...repeat([[250, 230, 120]], 100));
  return pixels;
};

test("an image of flat colors never yields the same swatch twice", () => {
  const pixels = repeat(FLAT, 4000);
  // No merging at all is the hard case: nothing downstream is left to hide a repeat.
  const colors = extract(pixels, 16, 0);
  assert.equal(new Set(colors.map(String)).size, colors.length);
  assert.equal(colors.length, FLAT.length);
});

test("the color count is a ceiling, never an instruction to invent colors", () => {
  const pixels = repeat(FLAT, 4000);
  assert.equal(extract(pixels, 2, 12).length, 2);
  assert.equal(extract(pixels, 4, 12).length, 4);
  assert.equal(extract(pixels, 12, 12).length, 4);
});

test("raising the count only ever adds to what was already there", () => {
  const pixels = photo();
  for (const similarity of [0, 12, 40]) {
    let previous: string[] = [];
    for (const count of [2, 4, 6, 8, 10, 16]) {
      const colors = extract(pixels, count, similarity).map(String);
      assert.ok(
        colors.length >= previous.length,
        `count ${count} at similarity ${similarity} returned ${colors.length} colors after ${previous.length}`,
      );
      // The swatches you already had must still be there, not re-derived into different ones.
      previous.forEach((color) => assert.ok(colors.includes(color), `count ${count} dropped ${color}`));
      previous = colors;
    }
  }
});

test("merging harder only ever removes colors", () => {
  const pixels = photo();
  let previous = Number.POSITIVE_INFINITY;
  for (const similarity of [0, 5, 12, 25, 40]) {
    const colors = extract(pixels, 16, similarity);
    assert.ok(colors.length <= previous, `similarity ${similarity} returned ${colors.length} colors after ${previous}`);
    assert.equal(new Set(colors.map(String)).size, colors.length);
    previous = colors.length;
  }
});

test("the quantiser reports the colors covering most of the image first", () => {
  const pixels = [...repeat([[10, 10, 10]], 900), ...repeat([[250, 250, 250]], 90), ...repeat([[250, 0, 0]], 10)];
  const entries = quantizeWeighted(pixels, 8);

  // This ordering is what lets the count act as a ceiling: it does not depend on the count asked for.
  const weights = entries.map((entry) => entry.weight);
  assert.deepEqual(
    weights,
    [...weights].sort((a, b) => b - a),
  );
  assert.equal(
    weights.reduce((sum, weight) => sum + weight, 0),
    pixels.length,
  );
  // The wall of near-black is nine tenths of the picture, so it leads.
  assert.deepEqual(entries[0].rgb, [10, 10, 10]);
});

test("quantize still returns its colors darkest first", () => {
  const colors = quantize(repeat(FLAT, 400), 8);
  const lightness = colors.map((color) => color[0] + color[1] + color[2]);
  assert.deepEqual(
    lightness,
    [...lightness].sort((a, b) => a - b),
  );
});
