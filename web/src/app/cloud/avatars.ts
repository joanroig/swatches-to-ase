import type { AvatarColors } from "../types";
import { hslToRgb, rgbToHex } from "../utils/color";
import { randomBetween } from "../utils/math";

export const CLOUD_AVATAR_PLACEHOLDER = "/avatar-placeholder.svg";

export const DEFAULT_AVATAR_COLORS: AvatarColors = {
  background: "#e2e8f0",
  foreground: "#a5b4fc",
};

const normalizeAvatarColor = (value: string | null | undefined, fallback: string) => {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim().toLowerCase();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-f]{3}$/.test(hex) && !/^[0-9a-f]{6}$/.test(hex)) {
    return fallback;
  }
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((channel) => `${channel}${channel}`)
          .join("")
      : hex;
  return `#${expanded}`;
};

export const normalizeAvatarColors = (value?: Partial<AvatarColors> | null): AvatarColors => ({
  background: normalizeAvatarColor(value?.background, DEFAULT_AVATAR_COLORS.background),
  foreground: normalizeAvatarColor(value?.foreground, DEFAULT_AVATAR_COLORS.foreground),
});

export const isAvatarColors = (value: unknown): value is AvatarColors => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as AvatarColors;
  return typeof candidate.background === "string" && typeof candidate.foreground === "string";
};

export const areAvatarColorsEqual = (first?: AvatarColors | null, second?: AvatarColors | null) => {
  if (!first || !second) {
    return false;
  }
  const normalizedFirst = normalizeAvatarColors(first);
  const normalizedSecond = normalizeAvatarColors(second);
  return normalizedFirst.background === normalizedSecond.background && normalizedFirst.foreground === normalizedSecond.foreground;
};

const buildAvatarSvg = (colors: AvatarColors) =>
  `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-hidden="true">
  <rect width="96" height="96" rx="22" fill="${colors.background}" />
  <circle cx="48" cy="38" r="16" fill="${colors.foreground}" />
  <path d="M20 71c4-18 52-18 56 0" fill="${colors.foreground}" />
</svg>
`.trim();

const buildAvatarDataUrl = (colors: AvatarColors) => `data:image/svg+xml;utf8,${encodeURIComponent(buildAvatarSvg(colors))}`;

export const getCloudAvatarSrc = (value?: AvatarColors | null) => {
  if (!value) {
    return CLOUD_AVATAR_PLACEHOLDER;
  }
  return buildAvatarDataUrl(normalizeAvatarColors(value));
};

export const generateAvatarColors = (): AvatarColors => {
  const hue = randomBetween(0, 360);
  const saturation = randomBetween(0.55, 0.9);
  const lightness = randomBetween(0.45, 0.65);
  const background = rgbToHex(hslToRgb(hue, saturation, lightness));
  const foreground = rgbToHex(hslToRgb(hue + 180, saturation, lightness));
  return normalizeAvatarColors({ background, foreground });
};
