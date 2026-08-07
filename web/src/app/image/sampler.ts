import type { Rgb255 } from "./quantize";
import { mergeSimilar, quantize } from "./quantize";

/**
 * Reads pixels out of an image so colours can be extracted from it.
 *
 * The image is drawn once into an offscreen canvas at a reduced size: quantising a 12-megapixel
 * photo pixel-by-pixel would block the main thread for seconds, and a downscale changes the result
 * only marginally because it is averaging the very pixels the quantiser would average anyway.
 */

const MAX_SAMPLE_EDGE = 240;
/** Pixels this transparent carry no useful colour. */
const MIN_ALPHA = 128;

export type ImageSampler = {
  width: number;
  height: number;
  /** Colour at a normalised (0..1, 0..1) point on the image. */
  sampleAt: (x: number, y: number) => Rgb255;
  /** The `count` most representative colours, with near-duplicates merged. */
  extract: (count: number, similarity: number) => Rgb255[];
};

export const loadImageSampler = async (source: Blob | string): Promise<ImageSampler> => {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.crossOrigin = "anonymous";
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Unable to decode image"));
      element.src = url;
    });

    const scale = Math.min(1, MAX_SAMPLE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Canvas 2D context unavailable");
    }
    context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);

    const pixelAt = (px: number, py: number): Rgb255 => {
      const offset = (py * width + px) * 4;
      return [data[offset], data[offset + 1], data[offset + 2]];
    };

    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      sampleAt: (x, y) => {
        const px = Math.min(width - 1, Math.max(0, Math.round(x * (width - 1))));
        const py = Math.min(height - 1, Math.max(0, Math.round(y * (height - 1))));
        return pixelAt(px, py);
      },
      extract: (count, similarity) => {
        const pixels: Rgb255[] = [];
        for (let offset = 0; offset < data.length; offset += 4) {
          if (data[offset + 3] >= MIN_ALPHA) {
            pixels.push([data[offset], data[offset + 1], data[offset + 2]]);
          }
        }
        // Over-quantise first so merging has candidates to choose between, then merge, then trim.
        // `count` is a ceiling, not a quota: if the image genuinely holds four colours, asking for
        // sixteen should still give four rather than fourteen shades of the same blue.
        const raw = quantize(pixels, Math.min(64, Math.max(count * 3, count)));
        return mergeSimilar(raw, similarity).slice(0, count);
      },
    };
  } finally {
    if (typeof source !== "string") {
      URL.revokeObjectURL(url);
    }
  }
};
