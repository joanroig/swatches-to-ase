import type { PaletteColor, StyleRanges } from "../types";
import { createId } from "../utils/id";
import { randomBetween, normalizeHue } from "../utils/math";
import { hslToRgb, rgbToHex } from "../utils/color";
import { nameColor } from "./naming";

const pickFromRanges = (ranges: Array<[number, number]>) => {
  const total = ranges.reduce((sum, [min, max]) => sum + (max - min), 0);
  let target = Math.random() * total;
  for (const [min, max] of ranges) {
    const span = max - min;
    if (target <= span) {
      return min + target;
    }
    target -= span;
  }
  return ranges[0]?.[0] ?? 0;
};

const pickWarmHue = () =>
  pickFromRanges([
    [0, 60],
    [300, 360],
  ]);

const pickCoolHue = () => pickFromRanges([[180, 260]]);

const createOffsets = (base: number, count: number, spread: number) => {
  if (count <= 1) {
    return [normalizeHue(base)];
  }
  const step = spread / (count - 1);
  const start = -spread / 2;
  return Array.from({ length: count }, (_, index) =>
    normalizeHue(base + start + step * index + randomBetween(-4, 4))
  );
};

const expandHues = (bases: number[], count: number, jitter = 12) =>
  Array.from({ length: count }, (_, index) =>
    normalizeHue(bases[index % bases.length] + randomBetween(-jitter, jitter))
  );

const getStyleRanges = (style: string): StyleRanges => {
  switch (style) {
    case "neutral":
      return { s: [0.05, 0.25], l: [0.35, 0.82] };
    case "pastel-pair":
      return { s: [0.25, 0.5], l: [0.7, 0.9] };
    case "vivid-pair":
      return { s: [0.7, 0.95], l: [0.4, 0.62] };
    case "shade":
      return { s: [0.45, 0.75], l: [0.2, 0.85], isShade: true };
    case "warm-pair":
    case "cold-pair":
    case "warm-cold":
      return { s: [0.55, 0.85], l: [0.35, 0.68] };
    case "contrasting":
      return { s: [0.5, 0.9], l: [0.35, 0.7] };
    default:
      return { s: [0.45, 0.8], l: [0.35, 0.72] };
  }
};

const createHueList = (style: string, count: number, baseHue?: number) => {
  const hasBase = Number.isFinite(baseHue);
  const base = hasBase ? (baseHue as number) : randomBetween(0, 360);
  switch (style) {
    case "shade":
      return Array.from({ length: count }, () => base);
    case "same-family":
      return createOffsets(base, count, 18);
    case "analogous":
      return createOffsets(base, count, 60);
    case "complementary":
      return expandHues([base, normalizeHue(base + 180)], count, 10);
    case "triadic":
      return expandHues(
        [base, normalizeHue(base + 120), normalizeHue(base + 240)],
        count,
        8
      );
    case "contrasting":
      return Array.from({ length: count }, (_, index) =>
        normalizeHue(base + (360 / count) * index + randomBetween(-8, 8))
      );
    case "warm-cold":
      return expandHues(
        hasBase ? [base, normalizeHue(base + 180)] : [pickWarmHue(), pickCoolHue()],
        count,
        12
      );
    case "warm-pair":
      return (() => {
        const warmBase = hasBase ? base : pickWarmHue();
        return expandHues(
          [
            warmBase,
            normalizeHue(
              warmBase + randomBetween(25, 60) * (Math.random() > 0.5 ? 1 : -1)
            ),
          ],
          count,
          10
        );
      })();
    case "cold-pair":
      return (() => {
        const coolBase = hasBase ? base : pickCoolHue();
        return expandHues(
          [
            coolBase,
            normalizeHue(
              coolBase + randomBetween(20, 50) * (Math.random() > 0.5 ? 1 : -1)
            ),
          ],
          count,
          10
        );
      })();
    case "pastel-pair":
      return expandHues([base, normalizeHue(base + randomBetween(140, 200))], count, 6);
    case "vivid-pair":
      return expandHues([base, normalizeHue(base + randomBetween(140, 200))], count, 10);
    case "neutral":
      return Array.from({ length: count }, (_, index) =>
        normalizeHue(base + (360 / Math.max(count, 1)) * index)
      );
    default:
      return createOffsets(base, count, 90);
  }
};

const createShadeLightness = (count: number) => {
  if (count <= 1) {
    return [0.55];
  }
  const start = 0.2;
  const end = 0.86;
  return Array.from({ length: count }, (_, index) =>
    start + (end - start) * (index / (count - 1))
  );
};

export const generatePaletteColors = (
  style: string,
  count = 5,
  nameFormat: string,
  baseHue?: number
) => {
  if (count <= 0) {
    return [] as PaletteColor[];
  }
  const hueList = createHueList(style, count, baseHue);
  const ranges = getStyleRanges(style);
  const shadeLightness = ranges.isShade ? createShadeLightness(count) : [];

  return hueList.map((hue, index) => {
    const saturation = randomBetween(ranges.s[0], ranges.s[1]);
    const lightness = ranges.isShade
      ? shadeLightness[index] ?? randomBetween(ranges.l[0], ranges.l[1])
      : randomBetween(ranges.l[0], ranges.l[1]);
    const rgb = hslToRgb(hue, saturation, lightness);
    const hex = rgbToHex(rgb).toUpperCase();
    return {
      id: createId(),
      name: nameColor(hex, nameFormat, index),
      rgb,
    };
  });
};
