import convert from "color-convert";

export type Rgb255 = [number, number, number];

/** A representative color and how many pixels of the image it stands for. */
export type WeightedColor = { rgb: Rgb255; weight: number };

/**
 * Median-cut color quantisation.
 *
 * Chosen over k-means because it is deterministic — the same image always yields the same palette,
 * which matters when someone re-imports a picture — and it needs no iteration count or seeding.
 */

type Box = {
  pixels: Rgb255[];
  min: Rgb255;
  max: Rgb255;
};

const boundsOf = (pixels: Rgb255[]): { min: Rgb255; max: Rgb255 } => {
  const min: Rgb255 = [255, 255, 255];
  const max: Rgb255 = [0, 0, 0];
  pixels.forEach((pixel) => {
    for (let channel = 0; channel < 3; channel += 1) {
      min[channel] = Math.min(min[channel], pixel[channel]);
      max[channel] = Math.max(max[channel], pixel[channel]);
    }
  });
  return { min, max };
};

const createBox = (pixels: Rgb255[]): Box => ({ pixels, ...boundsOf(pixels) });

/** The channel with the widest spread is the one worth splitting. */
const widestChannel = (box: Box) => {
  const spans = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
  return spans.indexOf(Math.max(...spans));
};

/**
 * A box holding a single color has nothing left to separate: splitting it yields two boxes that
 * average to that same color. That is where strips of identical swatches came from, so such a box
 * is never chosen as a split target however many pixels it holds.
 */
const isSplittable = (box: Box) => box.pixels.length > 1 && (box.max[0] > box.min[0] || box.max[1] > box.min[1] || box.max[2] > box.min[2]);

const splitBox = (box: Box): [Box, Box] | null => {
  if (!isSplittable(box)) {
    return null;
  }
  const channel = widestChannel(box);
  const sorted = [...box.pixels].sort((a, b) => a[channel] - b[channel]);
  const middle = Math.floor(sorted.length / 2);
  return [createBox(sorted.slice(0, middle)), createBox(sorted.slice(middle))];
};

const averageOf = (pixels: Rgb255[]): Rgb255 => {
  const total = pixels.reduce((sum, pixel) => [sum[0] + pixel[0], sum[1] + pixel[1], sum[2] + pixel[2]], [0, 0, 0]);
  const count = Math.max(1, pixels.length);
  return [Math.round(total[0] / count), Math.round(total[1] / count), Math.round(total[2] / count)];
};

const toLab = (rgb: Rgb255) => convert.rgb.lab(rgb);

const labDistance = (a: number[], b: number[]) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

/** Perceptual distance (CIE76). Good enough for "are these two swatches the same color?". */
export const colorDistance = (a: Rgb255, b: Rgb255) => labDistance(toLab(a), toLab(b));

/** Darkest first reads as a natural ramp rather than an arbitrary order. */
export const sortByLightness = (colors: Rgb255[]): Rgb255[] => [...colors].sort((a, b) => toLab(a)[0] - toLab(b)[0]);

/**
 * Drop colors that sit within `threshold` of one already kept, folding their weight into the
 * survivor so the merged entry still reflects how much of the image it covers.
 *
 * Photographs are full of near-duplicates — a sky is a hundred barely different blues — and a
 * palette of near-duplicates is useless, so this is exposed as a slider in the UI. A threshold of
 * zero still drops exact repeats: no palette wants the same swatch twice.
 */
export const mergeSimilarWeighted = (colors: WeightedColor[], threshold: number): WeightedColor[] => {
  const limit = Math.max(0, threshold);
  const kept: WeightedColor[] = [];
  const keptLabs: number[][] = [];
  colors.forEach((color) => {
    const lab = toLab(color.rgb);
    const match = keptLabs.findIndex((existing) => {
      const distance = labDistance(existing, lab);
      return distance === 0 || distance < limit;
    });
    if (match >= 0) {
      kept[match].weight += color.weight;
      return;
    }
    kept.push({ rgb: color.rgb, weight: color.weight });
    keptLabs.push(lab);
  });
  return kept;
};

export const mergeSimilar = (colors: Rgb255[], threshold: number): Rgb255[] =>
  mergeSimilarWeighted(
    colors.map((rgb) => ({ rgb, weight: 1 })),
    threshold,
  ).map((entry) => entry.rgb);

/**
 * Reduce a pixel set to at most `count` representative colors, most of the image first.
 *
 * Ordering by coverage is what lets a caller treat `count` as a ceiling: the ranking does not
 * depend on how many colors were asked for, so taking fewer of them takes a prefix rather than a
 * different answer.
 */
export const quantizeWeighted = (pixels: Rgb255[], count: number): WeightedColor[] => {
  if (pixels.length === 0 || count < 1) {
    return [];
  }
  let boxes: Box[] = [createBox(pixels)];

  while (boxes.length < count) {
    // Always split the box holding the most pixels: it is the one contributing most error.
    let targetIndex = -1;
    let largest = 1;
    boxes.forEach((box, index) => {
      if (isSplittable(box) && box.pixels.length > largest) {
        largest = box.pixels.length;
        targetIndex = index;
      }
    });
    if (targetIndex < 0) {
      break;
    }
    const split = splitBox(boxes[targetIndex]);
    if (!split) {
      break;
    }
    boxes = [...boxes.slice(0, targetIndex), ...split, ...boxes.slice(targetIndex + 1)];
  }

  // Two boxes can still average to the same color; fold them together rather than report it twice.
  const byColor = new Map<string, WeightedColor>();
  boxes.forEach((box) => {
    const rgb = averageOf(box.pixels);
    const key = rgb.join(",");
    const existing = byColor.get(key);
    if (existing) {
      existing.weight += box.pixels.length;
      return;
    }
    byColor.set(key, { rgb, weight: box.pixels.length });
  });

  return [...byColor.values()].sort((a, b) => b.weight - a.weight);
};

/** Reduce a pixel set to at most `count` representative colors, darkest first. */
export const quantize = (pixels: Rgb255[], count: number): Rgb255[] =>
  sortByLightness(quantizeWeighted(pixels, count).map((entry) => entry.rgb));
