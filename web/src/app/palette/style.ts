import { STYLE_LABELS } from "../config";
import { toTitleCase } from "../utils/text";

export const getStyleLabel = (style: string) =>
  STYLE_LABELS[style] ?? toTitleCase(style);
