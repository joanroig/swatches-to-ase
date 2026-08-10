import convert from "color-convert";

export type Rgb255 = [number, number, number];

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

const splitBox = (box: Box): [Box, Box] | null => {
  if (box.pixels.length < 2) {
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

/** Perceptual distance (CIE76). Good enough for "are these two swatches the same color?". */
export const colorDistance = (a: Rgb255, b: Rgb255) => {
  const [l1, a1, b1] = convert.rgb.lab(a);
  const [l2, a2, b2] = convert.rgb.lab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
};

/**
 * Drop colors that sit within `threshold` of one already kept.
 *
 * Photographs are full of near-duplicates — a sky is a hundred barely different blues — and a
 * palette of near-duplicates is useless, so this is exposed as a slider in the UI.
 */
export const mergeSimilar = (colors: Rgb255[], threshold: number): Rgb255[] => {
  if (threshold <= 0) {
    return colors;
  }
  const kept: Rgb255[] = [];
  colors.forEach((color) => {
    if (!kept.some((existing) => colorDistance(existing, color) < threshold)) {
      kept.push(color);
    }
  });
  return kept;
};

/** Reduce a pixel set to at most `count` representative colors. */
export const quantize = (pixels: Rgb255[], count: number): Rgb255[] => {
  if (pixels.length === 0) {
    return [];
  }
  let boxes: Box[] = [createBox(pixels)];

  while (boxes.length < count) {
    // Always split the box holding the most pixels: it is the one contributing most error.
    let targetIndex = -1;
    let largest = 1;
    boxes.forEach((box, index) => {
      if (box.pixels.length > largest) {
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

  // Darkest first reads as a natural ramp rather than an arbitrary order.
  return boxes.map((box) => averageOf(box.pixels)).sort((a, b) => convert.rgb.lab(a)[0] - convert.rgb.lab(b)[0]);
};
