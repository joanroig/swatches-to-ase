import { getStyleLabel as getTranslatedStyleLabel } from "../i18n";
import { toTitleCase } from "../utils/text";

export const getStyleLabel = (style: string) => {
  const label = getTranslatedStyleLabel(style);
  return label.startsWith("style.") ? toTitleCase(style) : label;
};
