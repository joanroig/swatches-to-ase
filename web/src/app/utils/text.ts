export const toTitleCase = (value: string) =>
  value
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((chunk) => chunk[0]?.toUpperCase() + chunk.slice(1))
    .join(" ");

export const sanitizeFileName = (name: string) =>
  name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "palette";

export const toCssVarName = (name: string, index: number) => {
  const base = sanitizeFileName(name).toLowerCase() || `color-${index + 1}`;
  const trimmed = base.replace(/^-+/, "");
  return /^[a-z]/i.test(trimmed) ? trimmed : `color-${trimmed}`;
};
