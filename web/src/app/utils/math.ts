export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(Math.max(value, min), max);

export const randomBetween = (min: number, max: number) =>
  min + Math.random() * (max - min);

export const normalizeHue = (value: number) => ((value % 360) + 360) % 360;
