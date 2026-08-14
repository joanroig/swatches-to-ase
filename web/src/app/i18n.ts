import en from "./translations/en";
import es from "./translations/es";
import type { TranslationMap } from "./translations/types";

export const languages = ["en", "es"] as const;
export type Language = (typeof languages)[number];
export type LanguagePreference = "system" | Language;

const translations: Record<Language, TranslationMap> = { en, es };

type TranslationReport = {
  baseLanguage: Language;
  missing: Partial<Record<Language, string[]>>;
  extra: Partial<Record<Language, string[]>>;
};

export const getTranslationReport = (): TranslationReport => {
  const baseLanguage: Language = "en";
  const baseMap = translations[baseLanguage];
  const baseKeys = Object.keys(baseMap);
  const missing: Partial<Record<Language, string[]>> = {};
  const extra: Partial<Record<Language, string[]>> = {};

  languages.forEach((language) => {
    if (language === baseLanguage) {
      return;
    }
    const map = translations[language];
    const mapKeys = Object.keys(map);
    const missingKeys = baseKeys.filter((key) => !(key in map));
    const extraKeys = mapKeys.filter((key) => !(key in baseMap));
    if (missingKeys.length > 0) {
      missing[language] = missingKeys;
    }
    if (extraKeys.length > 0) {
      extra[language] = extraKeys;
    }
  });

  return { baseLanguage, missing, extra };
};

const logTranslationReport = (report: TranslationReport) => {
  const missingEntries = Object.entries(report.missing) as [Language, string[]][];
  const extraEntries = Object.entries(report.extra) as [Language, string[]][];
  if (missingEntries.length === 0 && extraEntries.length === 0) {
    return;
  }
  missingEntries.forEach(([language, keys]) => {
    console.warn(`[i18n] Missing ${language} translations (${keys.length}):`, keys);
  });
  extraEntries.forEach(([language, keys]) => {
    console.warn(`[i18n] Extra ${language} translations (${keys.length}):`, keys);
  });
};

const isDevBuild = typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
if (isDevBuild) {
  logTranslationReport(getTranslationReport());
}

const formatTemplate = (template: string, params?: Record<string, string | number>) => {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key];
    if (value === undefined || value === null) {
      return match;
    }
    return String(value);
  });
};

const isLanguage = (value: string): value is Language => {
  return (languages as readonly string[]).includes(value);
};

export const normalizeLanguagePreference = (value?: string | null): LanguagePreference => {
  if (value === "system") {
    return "system";
  }
  if (value && isLanguage(value)) {
    return value;
  }
  return "system";
};

const getSystemLanguage = (): Language => {
  if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
    const candidate = navigator.language.toLowerCase();
    const matched = languages.find((language) => candidate.startsWith(language));
    if (matched) {
      return matched;
    }
  }
  return "en";
};

export const resolveLanguage = (preference: LanguagePreference): Language => {
  if (preference === "system") {
    return getSystemLanguage();
  }
  return preference;
};

let currentPreference: LanguagePreference = "system";
let currentLanguage: Language = resolveLanguage(currentPreference);

const listeners = new Set<(language: Language) => void>();

export const onLanguageChange = (listener: (language: Language) => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notify = () => {
  listeners.forEach((listener) => listener(currentLanguage));
};

export const t = (key: string, params?: Record<string, string | number>) => {
  const dictionary = translations[currentLanguage] ?? translations.en;
  const fallback = translations.en;
  const entry = dictionary[key] ?? fallback[key];
  if (!entry) {
    return key;
  }
  if (typeof entry === "string") {
    return formatTemplate(entry, params);
  }
  const count = typeof params?.count === "number" ? params.count : Number(params?.count ?? 0);
  const template = count === 1 ? entry.one : entry.other;
  return formatTemplate(template, params);
};

/*
 * Write a label without demolishing the control it belongs to.
 *
 * Several buttons are described twice: `data-i18n` says what they read, and `setButtonContent` gives
 * them an icon and a label span. `textContent = ...` here would throw the icon away and leave bare
 * text behind — which is what happened to New folder, Import, Export all and New whenever a
 * translation pass ran without a relabel behind it to build them back.
 *
 * It also only writes when the text actually differs, so a pass that changes nothing costs nothing.
 */
const setLocalizedText = (element: HTMLElement, text: string) => {
  const icon = element.firstElementChild;
  if (icon instanceof SVGElement && icon.classList.contains("icon")) {
    const label = icon.nextElementSibling;
    if (label instanceof HTMLSpanElement && label.textContent !== text) {
      label.textContent = text;
    }
    if (element.getAttribute("aria-label") !== null) {
      element.setAttribute("aria-label", text);
    }
    if (element.title) {
      element.title = text;
    }
    return;
  }
  if (element.textContent !== text) {
    element.textContent = text;
  }
};

export const applyTranslations = (root: ParentNode | null = typeof document !== "undefined" ? document : null) => {
  if (!root || typeof (root as Document).querySelectorAll !== "function") {
    return;
  }
  const elements = (root as Document).querySelectorAll<HTMLElement>(
    "[data-i18n], [data-i18n-placeholder], [data-i18n-aria-label], [data-i18n-title], [data-i18n-value]",
  );
  elements.forEach((element) => {
    const textKey = element.dataset.i18n;
    if (textKey) {
      setLocalizedText(element, t(textKey));
    }
    const placeholderKey = element.dataset.i18nPlaceholder;
    if (placeholderKey) {
      element.setAttribute("placeholder", t(placeholderKey));
    }
    const ariaKey = element.dataset.i18nAriaLabel;
    if (ariaKey) {
      element.setAttribute("aria-label", t(ariaKey));
    }
    const titleKey = element.dataset.i18nTitle;
    if (titleKey) {
      element.setAttribute("title", t(titleKey));
    }
    const valueKey = element.dataset.i18nValue;
    if (valueKey && "value" in element) {
      (element as HTMLInputElement).value = t(valueKey);
    }
  });
};

export const setLanguagePreference = (value?: string | null, options: { apply?: boolean; notify?: boolean } = {}): Language => {
  const normalized = normalizeLanguagePreference(value);
  currentPreference = normalized;
  const resolved = resolveLanguage(normalized);
  const changed = resolved !== currentLanguage;
  currentLanguage = resolved;
  if (typeof document !== "undefined") {
    document.documentElement.lang = currentLanguage;
  }
  if (options.apply !== false) {
    applyTranslations();
  }
  if (changed || options.notify) {
    notify();
  }
  return currentLanguage;
};

export const getCurrentLanguage = () => currentLanguage;

export const getLanguagePreference = () => currentPreference;

export const getColorNotationLabel = (notation: string) => {
  const key = `notation.${notation.toLowerCase()}`;
  return t(key);
};

export const getStyleLabel = (style: string) => {
  const keyMap: Record<string, string> = {
    empty: "style.empty",
    analogous: "style.analogous",
    "cold-pair": "style.coldPair",
    complementary: "style.complementary",
    contrasting: "style.contrasting",
    neutral: "style.neutral",
    "pastel-pair": "style.pastelPair",
    "same-family": "style.sameFamily",
    shade: "style.shade",
    triadic: "style.triadic",
    "vivid-pair": "style.vividPair",
    "warm-cold": "style.warmCold",
    "warm-pair": "style.warmPair",
  };
  const key = keyMap[style];
  return key ? t(key) : t("style." + style, { style });
};

if (typeof window !== "undefined") {
  window.addEventListener("languagechange", () => {
    if (currentPreference === "system") {
      setLanguagePreference("system");
    }
  });
}
