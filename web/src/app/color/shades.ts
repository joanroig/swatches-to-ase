import convert from "color-convert";

import { getRgb255, hslToRgb } from "../utils/color";

export type Shade = {
  rgb: [number, number, number];
  /** HSL lightness, 0..100, so the ramp can label itself. */
  lightness: number;
  /** True for the entry closest to the colour the ramp was built from. */
  isSource: boolean;
};

const DEFAULT_STEPS = 19;

/**
 * A tint-to-shade ramp: the colour's hue and saturation held constant while lightness sweeps from
 * near-white to near-black. This is the ramp Coolors shows, and it is the one designers reach for
 * when building a scale from a brand colour.
 */
export const buildShades = (rgb: [number, number, number], steps = DEFAULT_STEPS): Shade[] => {
  const [r, g, b] = getRgb255(rgb);
  const [hue, saturation, sourceLightness] = convert.rgb.hsl(r, g, b);

  // Spread evenly across the usable range rather than 0..100, since pure black and pure white
  // carry no information about the colour.
  const min = 4;
  const max = 96;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  const entries = Array.from({ length: steps }, (_unused, index) => {
    const lightness = max - ((max - min) * index) / (steps - 1);
    const distance = Math.abs(lightness - sourceLightness);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
    return {
      rgb: hslToRgb(hue, saturation / 100, lightness / 100),
      lightness: Math.round(lightness),
      isSource: false,
    };
  });

  entries[closestIndex].isSource = true;
  return entries;
};
