/**
 * What a palette *is*, so Discover can be browsed by it.
 *
 * Sorting only ever answered "which of these is newest or most liked". Finding a palette you can
 * actually use means asking for warm ones, or dark ones, or ones with a green in them — questions
 * about the colours themselves. Nothing on the public record answers those, so they are derived
 * here from the colours every palette already carries.
 *
 * Deliberately pure and free of DOM or state: these are judgements about a list of colours, and
 * they are the kind of thing that is easy to get subtly wrong, so they are unit-tested directly.
 */

import convert from "color-convert";

import type { PublicPaletteColor } from "../types";

export const PALETTE_STYLES = ["warm", "cold", "bright", "dark", "pastel", "vintage", "monochromatic", "gradient"] as const;

export const PALETTE_COLORS = [
  "red",
  "orange",
  "brown",
  "yellow",
  "green",
  "turquoise",
  "blue",
  "purple",
  "pink",
  "grey",
  "black",
  "white",
] as const;

export type PaletteStyle = (typeof PALETTE_STYLES)[number];
export type PaletteColorFamily = (typeof PALETTE_COLORS)[number];

export const isPaletteStyle = (value: string): value is PaletteStyle => (PALETTE_STYLES as readonly string[]).includes(value);

export const isPaletteColorFamily = (value: string): value is PaletteColorFamily =>
  (PALETTE_COLORS as readonly string[]).includes(value);

/*
 * Hue, plus both saturations, on 0–1.
 *
 * Two, because they disagree about exactly the thing these rules care about. HSL saturation calls a
 * pale pink *highly* saturated — it is a pure hue that happens to be light — while HSV saturation
 * calls it barely saturated at all, which is what "pastel" actually means. Lightness comes from HSL
 * and "how far from white" from HSV, and each rule below says which it is asking for.
 */
type Hsl = { h: number; s: number; l: number; chroma: number; value: number };

const toHsl = (rgb: [number, number, number]): Hsl => {
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  const [h, s, l] = convert.rgb.hsl(r, g, b);
  const [, hsvS, hsvV] = convert.rgb.hsv(r, g, b);
  return { h, s: s / 100, l: l / 100, chroma: hsvS / 100, value: hsvV / 100 };
};

const mean = (values: number[]) => (values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length);

/**
 * The shortest way round the wheel between two hues.
 *
 * Plain subtraction says red (355°) and red (5°) are 350° apart, which would break every rule that
 * asks how spread out a palette's hues are.
 */
const hueDistance = (a: number, b: number) => {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
};

/** A colour with so little saturation that its hue is noise rather than information. */
const isNeutral = (hsl: Hsl) => hsl.s < 0.12;

/* ------------------------------------------------------------------ colour --- */

/*
 * Hue bands, in degrees. Brown has no band of its own — it is a dark, unsaturated orange — so it is
 * decided before the wheel is consulted at all.
 */
const HUE_BANDS: { family: PaletteColorFamily; from: number; to: number }[] = [
  { family: "red", from: 345, to: 10 },
  { family: "orange", from: 10, to: 40 },
  { family: "yellow", from: 40, to: 70 },
  { family: "green", from: 70, to: 160 },
  { family: "turquoise", from: 160, to: 195 },
  { family: "blue", from: 195, to: 255 },
  { family: "purple", from: 255, to: 290 },
  { family: "pink", from: 290, to: 345 },
];

const inBand = (hue: number, from: number, to: number) => (from > to ? hue >= from || hue < to : hue >= from && hue < to);

/** Which family a single colour belongs to. Every colour belongs to exactly one. */
export const colorFamilyOf = (rgb: [number, number, number]): PaletteColorFamily => {
  const hsl = toHsl(rgb);
  if (hsl.l <= 0.12) {
    return "black";
  }
  /*
   * Chroma, not HSL saturation. `#f7f8fa` is an off-white with a breath of blue in it, and HSL puts
   * its saturation at 0.23 — enough to fail a saturation gate and be filed under blue, which is not
   * a colour anybody would say that swatch is.
   */
  if (hsl.l >= 0.9 && hsl.chroma < 0.12) {
    return "white";
  }
  if (isNeutral(hsl)) {
    return "grey";
  }
  // Brown before the bands: a dark or muted orange reads as brown, and nobody looking for orange
  // means chocolate.
  const isBrownHue = inBand(hsl.h, 10, 45);
  if (isBrownHue && (hsl.l < 0.4 || (hsl.s < 0.55 && hsl.l < 0.62))) {
    return "brown";
  }
  return HUE_BANDS.find((band) => inBand(hsl.h, band.from, band.to))?.family ?? "grey";
};

/** The families present in a palette. A palette matches a colour filter if it contains one. */
export const colorFamiliesOf = (colors: PublicPaletteColor[]) => new Set(colors.map((color) => colorFamilyOf(color.rgb)));

/* ------------------------------------------------------------------- style --- */

/** Warm reds through yellows; cold greens through blues. Neutrals belong to neither. */
const isWarmHue = (hue: number) => hue >= 330 || hue < 75;
const isColdHue = (hue: number) => hue >= 150 && hue < 280;

/**
 * A ramp: the colours step through lightness in one direction, without doubling back.
 *
 * Checked on lightness rather than hue because that is what a gradient palette is — one colour
 * getting lighter or darker — and a two-hue blend still reads as a gradient if its lightness runs
 * one way. Needs at least three colours; two of anything is a pair, not a ramp.
 */
const isRamp = (list: Hsl[]) => {
  if (list.length < 3) {
    return false;
  }
  const steps = list.slice(1).map((hsl, index) => hsl.l - list[index].l);
  const allUp = steps.every((step) => step > 0.02);
  const allDown = steps.every((step) => step < -0.02);
  if (!allUp && !allDown) {
    return false;
  }
  // Evenly spaced, near enough: a ramp with one huge jump in it is a gradient in name only.
  const sizes = steps.map(Math.abs);
  return Math.max(...sizes) <= Math.min(...sizes) * 3.5;
};

/** Every style a palette qualifies for. A palette can be several — dark and cold, say. */
export const stylesOf = (colors: PublicPaletteColor[]): Set<PaletteStyle> => {
  const styles = new Set<PaletteStyle>();
  if (colors.length === 0) {
    return styles;
  }
  const list = colors.map((color) => toHsl(color.rgb));
  const chromatic = list.filter((hsl) => !isNeutral(hsl));
  const avgChroma = mean(list.map((hsl) => hsl.chroma));
  const avgLightness = mean(list.map((hsl) => hsl.l));
  const avgValue = mean(list.map((hsl) => hsl.value));

  // A majority, not all: one accent should not disqualify an otherwise warm palette.
  const majority = (count: number) => count * 2 > list.length;
  if (majority(chromatic.filter((hsl) => isWarmHue(hsl.h)).length)) {
    styles.add("warm");
  }
  if (majority(chromatic.filter((hsl) => isColdHue(hsl.h)).length)) {
    styles.add("cold");
  }
  // Strong colour that is also lit: chroma alone would let a deep maroon through.
  if (avgChroma >= 0.6 && avgValue >= 0.6) {
    styles.add("bright");
  }
  if (avgLightness <= 0.35) {
    styles.add("dark");
  }
  // Light and washed out. Chroma is the whole point: in HSL these read as almost fully saturated.
  if (avgLightness >= 0.72 && avgChroma > 0.05 && avgChroma <= 0.45) {
    styles.add("pastel");
  }
  // Muted and mid-toned: the faded look, which is low chroma without being grey or pale.
  if (avgChroma > 0.12 && avgChroma <= 0.5 && avgValue > 0.35 && avgValue < 0.85 && avgLightness < 0.72) {
    styles.add("vintage");
  }
  // One hue throughout. Measured against the first chromatic colour rather than an average, since
  // averaging hues across the 360° seam is meaningless.
  if (chromatic.length > 0 && chromatic.every((hsl) => hueDistance(hsl.h, chromatic[0].h) <= 25)) {
    styles.add("monochromatic");
  } else if (chromatic.length === 0) {
    styles.add("monochromatic");
  }
  if (isRamp(list)) {
    styles.add("gradient");
  }
  return styles;
};
