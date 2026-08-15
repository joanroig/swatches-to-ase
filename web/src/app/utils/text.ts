export const toTitleCase = (value: string) =>
  value
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((chunk) => chunk[0]?.toUpperCase() + chunk.slice(1))
    .join(" ");

export const sanitizeFileName = (name: string) => name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "palette";

/*
 * Palette and color names are typed by the user, and the picture exports paste them straight into
 * SVG and into the print window's markup. An ampersand in a name is enough to make an SVG that no
 * renderer will open, so nothing goes into a document unescaped.
 */
export const escapeMarkup = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Names are drawn into fixed-width cells that cannot reflow, so an over-long one is cut, not wrapped. */
export const truncateLabel = (value: string, maxChars: number) =>
  value.length > maxChars ? `${value.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…` : value;

export const toCssVarName = (name: string, index: number) => {
  const base = sanitizeFileName(name).toLowerCase() || `color-${index + 1}`;
  const trimmed = base.replace(/^-+/, "");
  return /^[a-z]/i.test(trimmed) ? trimmed : `color-${trimmed}`;
};
