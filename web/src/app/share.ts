import { SHARE_BASE_URL } from "./config";
import type { Palette, Preferences, SharedPalettePayload, SharedWorkspacePayload } from "./types";
import { rgbToHex } from "./utils/color";

const encodePayload = (payload: unknown) => btoa(encodeURIComponent(JSON.stringify(payload)));

const decodePayload = <T>(encoded: string): T | null => {
  try {
    const decoded = decodeURIComponent(atob(encoded));
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
};

const joinShareUrl = (segment: string) => (SHARE_BASE_URL.endsWith("/") ? `${SHARE_BASE_URL}${segment}` : `${SHARE_BASE_URL}/${segment}`);

const isPreferences = (value: unknown): value is Preferences => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Preferences;
  const motionValid =
    typeof candidate.motion === "undefined" || candidate.motion === "system" || candidate.motion === "on" || candidate.motion === "off";
  const languageValid =
    typeof candidate.language === "undefined" ||
    candidate.language === "system" ||
    candidate.language === "en" ||
    candidate.language === "es";
  return (
    typeof candidate.theme === "string" &&
    typeof candidate.colorNameFormat === "string" &&
    typeof candidate.addBlackWhite === "boolean" &&
    typeof candidate.exportFormat === "string" &&
    typeof candidate.colorNotation === "string" &&
    motionValid &&
    languageValid
  );
};

const isHex = (value: unknown) => typeof value === "string" && /^[0-9a-fA-F]{6}$/.test(value.trim());

export const parsePaletteHexSlug = (value: string) => {
  const normalized = value.trim().replace(/^\/+|\/+$/g, "");
  if (!normalized) {
    return null;
  }
  const parts = normalized.split("-").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const expanded = parts.map((part) => {
    if (/^[0-9a-fA-F]{3}$/.test(part)) {
      return part
        .split("")
        .map((channel) => `${channel}${channel}`)
        .join("")
        .toUpperCase();
    }
    if (/^[0-9a-fA-F]{6}$/.test(part)) {
      return part.toUpperCase();
    }
    return null;
  });
  if (expanded.some((part) => !part)) {
    return null;
  }
  return expanded as string[];
};

export const encodeSharedPalette = (palette: Palette) => {
  const payload: SharedPalettePayload = {
    name: palette.name,
    colors: palette.colors.map((color) => ({
      hex: rgbToHex(color.rgb).replace("#", "").toUpperCase(),
    })),
  };
  return encodePayload(payload);
};

export const decodeSharedPalette = (encoded: string) => {
  const payload = decodePayload<SharedPalettePayload>(encoded);
  if (!payload || !Array.isArray(payload.colors)) {
    return null;
  }
  return payload;
};

export const encodeSharedWorkspace = (payload: SharedWorkspacePayload) => encodePayload(payload);

export const decodeSharedWorkspace = (encoded: string) => {
  const payload = decodePayload<SharedWorkspacePayload>(encoded);
  if (!payload || !Array.isArray(payload.palettes) || !isPreferences(payload.preferences)) {
    return null;
  }
  const valid = payload.palettes.every(
    (palette) =>
      palette &&
      typeof palette === "object" &&
      typeof palette.name === "string" &&
      Array.isArray(palette.colors) &&
      palette.colors.every((color) => color && typeof color === "object" && isHex(color.hex)),
  );
  if (!valid) {
    return null;
  }
  return payload;
};

export const buildSharedPaletteUrl = (palette: Palette) => {
  const slug = palette.colors.map((color) => rgbToHex(color.rgb).replace("#", "").toLowerCase()).join("-");
  return joinShareUrl(slug);
};

export const buildCompleteShareUrl = (payload: SharedWorkspacePayload) =>
  `${SHARE_BASE_URL}?share=${encodeURIComponent(encodeSharedWorkspace(payload))}`;
