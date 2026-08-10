/** WCAG 2.1 contrast maths. Inputs are 0..1 RGB triples, matching the rest of the app. */

const channelLuminance = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

/** Relative luminance as defined by WCAG 2.1. */
export const relativeLuminance = ([r, g, b]: [number, number, number]) =>
  0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);

/** Contrast ratio between two colors, from 1 (identical) to 21 (black on white). */
export const contrastRatio = (a: [number, number, number], b: [number, number, number]) => {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
};

export type ContrastGrade = "AAA" | "AA" | "AA Large" | "Fail";

/** The best grade this ratio achieves for normal body text. */
export const gradeContrast = (ratio: number): ContrastGrade => {
  if (ratio >= 7) {
    return "AAA";
  }
  if (ratio >= 4.5) {
    return "AA";
  }
  if (ratio >= 3) {
    return "AA Large";
  }
  return "Fail";
};

export const WHITE: [number, number, number] = [1, 1, 1];
export const BLACK: [number, number, number] = [0, 0, 0];

/** Whichever of white or black text is more readable on this background. */
export const preferredTextColor = (background: [number, number, number]) =>
  contrastRatio(background, WHITE) >= contrastRatio(background, BLACK) ? WHITE : BLACK;
