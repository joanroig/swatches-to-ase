import type { Palette } from "../types";
import { t } from "../i18n";
import { createId } from "../utils/id";

type DuplicateLabels = {
  copy: string;
  untitled: string;
};

const defaultLabels = (): DuplicateLabels => ({
  copy: t("palette.copyLabel"),
  untitled: t("palette.untitled"),
});

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeName = (name: string, labels: DuplicateLabels) => name.trim() || labels.untitled;

const toCopyBase = (name: string, labels: DuplicateLabels) => {
  const normalized = normalizeName(name, labels);
  const copyPattern = new RegExp(`\\s+${escapeRegExp(labels.copy)}(?:\\s+\\d+)?$`, "i");
  return normalized.replace(copyPattern, "");
};

const createUniqueCopyName = (name: string, existingNames: string[], labels: DuplicateLabels) => {
  const base = toCopyBase(name, labels);
  const copyBase = `${base} ${labels.copy}`;
  const existing = new Set(existingNames.map((item) => normalizeName(item, labels)));
  let nextName = copyBase;
  let suffix = 2;
  while (existing.has(nextName)) {
    nextName = `${copyBase} ${suffix}`;
    suffix += 1;
  }
  return nextName;
};

export const duplicatePalette = (
  palette: Palette,
  existingNames: string[],
  createIdFn: () => string = createId,
  labels: DuplicateLabels = defaultLabels(),
): Palette => {
  const name = createUniqueCopyName(palette.name, existingNames, labels);
  return {
    id: createIdFn(),
    name,
    colors: palette.colors.map((color) => ({
      id: createIdFn(),
      name: color.name,
      rgb: [...color.rgb] as [number, number, number],
    })),
    lastModified: Date.now(),
    isPublic: false,
  };
};
