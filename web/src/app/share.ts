import { SHARE_BASE_URL } from "./config";
import type { Palette, Preferences, SharedPalettePayload, SharedWorkspacePayload } from "./types";
import { rgbToHex } from "./utils/color";

export const SHARE_NAME_PARAM = "name";
export const SHARE_AUTHOR_PARAM = "by";
export const SHARE_AUTHOR_ID_PARAM = "uid";

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
  const generateStyleValid = typeof candidate.generateStyle === "undefined" || typeof candidate.generateStyle === "string";
  return (
    typeof candidate.theme === "string" &&
    typeof candidate.colorNameFormat === "string" &&
    typeof candidate.addBlackWhite === "boolean" &&
    typeof candidate.exportFormat === "string" &&
    typeof candidate.colorNotation === "string" &&
    generateStyleValid &&
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
      name: color.name,
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

/*
 * The colors are the path, and who made it and what they called it ride alongside as query.
 *
 * The slug alone is a fine link — it is readable, and it is what the app has always produced — but
 * it says nothing, so every shared palette arrived at the other end titled "Shared palette" by
 * nobody. Keeping the name and owner out of the path leaves the old links working and the new ones
 * still legible.
 */
export type SharedPaletteAuthor = { id?: string | null; name?: string | null };

export const buildSharedPaletteUrl = (palette: Palette, author?: SharedPaletteAuthor | null) => {
  const slug = palette.colors.map((color) => rgbToHex(color.rgb).replace("#", "").toLowerCase()).join("-");
  const url = new URL(joinShareUrl(slug));
  const name = palette.name?.trim();
  if (name) {
    url.searchParams.set(SHARE_NAME_PARAM, name);
  }
  const authorName = author?.name?.trim();
  if (authorName) {
    url.searchParams.set(SHARE_AUTHOR_PARAM, authorName);
  }
  const authorId = author?.id?.trim();
  if (authorId) {
    url.searchParams.set(SHARE_AUTHOR_ID_PARAM, authorId);
  }
  return url.toString();
};

/** Reads back what `buildSharedPaletteUrl` wrote, and takes the parameters off the URL. */
export const takeSharedPaletteDetails = (url: URL) => {
  const read = (param: string) => {
    const value = url.searchParams.get(param)?.trim() ?? "";
    url.searchParams.delete(param);
    // Someone else's link, so cap what is shown rather than letting a title run off the dialog.
    return value.slice(0, 120);
  };
  return {
    name: read(SHARE_NAME_PARAM),
    authorName: read(SHARE_AUTHOR_PARAM),
    authorId: read(SHARE_AUTHOR_ID_PARAM),
  };
};

export const buildCompleteShareUrl = (payload: SharedWorkspacePayload) =>
  `${SHARE_BASE_URL}?share=${encodeURIComponent(encodeSharedWorkspace(payload))}`;
