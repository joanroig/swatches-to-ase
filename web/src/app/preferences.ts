import { COLOR_NOTATIONS, STORAGE_KEY, VALID_NAME_FORMATS } from "./config";
import {
  addBwToggle,
  colorNotationEditorSelect,
  colorNotationSelect,
  formatSelect,
  generateFormatSelect,
  generateStyleSelect,
  languageSelect,
  motionSelect,
  themeSelect,
} from "./dom";
import { getColorNotationLabel, normalizeLanguagePreference, setLanguagePreference } from "./i18n";
import { getSelectedExportFormat, setSelectedExportFormat } from "./export/manager";
import { persistPreferences } from "./persistence";
import type { Preferences } from "./types";

let onNotationChange: (() => void) | null = null;
const DEFAULT_GENERATE_STYLE = "shade";

const resolveGenerateStylePreference = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (generateStyleSelect?.querySelector(`option[value="${normalized}"]`)) {
    return normalized;
  }
  return DEFAULT_GENERATE_STYLE;
};

const applyGenerateStylePreference = (value?: string | null) => {
  if (generateStyleSelect) {
    generateStyleSelect.value = resolveGenerateStylePreference(value);
  }
};

export const setColorNotationChangeHandler = (handler: (() => void) | null) => {
  onNotationChange = handler;
};

export const getPreferencesPayload = (): Preferences => ({
  theme: themeSelect?.value ?? "system",
  motion: normalizeMotionPreference(motionSelect?.value),
  colorNameFormat: formatSelect?.value ?? generateFormatSelect?.value ?? "pantone",
  addBlackWhite: addBwToggle?.checked ?? false,
  exportFormat: getSelectedExportFormat(),
  colorNotation: getColorNotation(),
  generateStyle: resolveGenerateStylePreference(generateStyleSelect?.value),
  language: normalizeLanguagePreference(languageSelect?.value),
});

export const getOptions = () => ({
  colorNameFormat: formatSelect?.value ?? "pantone",
  addBlackWhite: addBwToggle?.checked ?? false,
});

export const getColorNotation = () => colorNotationSelect?.value ?? colorNotationEditorSelect?.value ?? "hex";

const normalizeMotionPreference = (value?: string) => {
  if (value === "on" || value === "off" || value === "system") {
    return value;
  }
  return "system";
};

export const applyTheme = (theme: string) => {
  const resolved = theme || "system";
  document.body.dataset.theme = resolved;
  document.documentElement.dataset.theme = resolved;
  window.desktopApi?.setTheme?.(resolved);
};

export const applyMotionPreference = (value: string, persist = true) => {
  const resolved = normalizeMotionPreference(value);
  if (motionSelect) {
    motionSelect.value = resolved;
  }
  document.body.dataset.motion = resolved;
  document.documentElement.dataset.motion = resolved;
  if (persist) {
    persistPreferences();
  }
};

export const applyColorNotation = (value: string, persist = true) => {
  const normalized = value || "hex";
  if (colorNotationSelect) {
    colorNotationSelect.value = normalized;
  }
  if (colorNotationEditorSelect) {
    colorNotationEditorSelect.value = normalized;
  }
  if (persist) {
    persistPreferences();
  }
  onNotationChange?.();
};

export const applyLanguagePreference = (value: string | null | undefined, persist = true) => {
  const normalized = normalizeLanguagePreference(value);
  if (languageSelect) {
    languageSelect.value = normalized;
  }
  setLanguagePreference(normalized, { notify: true });
  if (persist) {
    persistPreferences();
  }
};

export const applyRemotePreferences = (prefs: Preferences) => {
  if (themeSelect && prefs.theme) {
    themeSelect.value = prefs.theme;
  }
  if (motionSelect) {
    motionSelect.value = normalizeMotionPreference(prefs.motion);
  }
  if (formatSelect && prefs.colorNameFormat) {
    formatSelect.value = prefs.colorNameFormat;
  }
  if (generateFormatSelect && prefs.colorNameFormat) {
    generateFormatSelect.value = prefs.colorNameFormat;
  }
  applyGenerateStylePreference(prefs.generateStyle);
  if (addBwToggle) {
    addBwToggle.checked = prefs.addBlackWhite ?? false;
  }
  applyLanguagePreference(prefs.language ?? languageSelect?.value ?? "system", false);
  if (prefs.exportFormat) {
    setSelectedExportFormat(prefs.exportFormat);
  }
  if (prefs.colorNotation) {
    applyColorNotation(prefs.colorNotation, false);
  }
  applyTheme(themeSelect?.value ?? prefs.theme ?? "system");
  applyMotionPreference(motionSelect?.value ?? prefs.motion ?? "system", false);
};

export const syncNameFormat = (value: string) => {
  if (formatSelect) {
    formatSelect.value = value;
  }
  if (generateFormatSelect) {
    generateFormatSelect.value = value;
  }
  persistPreferences();
};

export const setupFormatSelects = () => {
  const formats = VALID_NAME_FORMATS;
  const populate = (select: HTMLSelectElement | null) => {
    if (!select) {
      return;
    }
    select.innerHTML = "";
    for (const format of formats) {
      const option = document.createElement("option");
      option.value = format;
      option.textContent = format;
      select.appendChild(option);
    }
  };
  populate(formatSelect);
  populate(generateFormatSelect);
  if (formatSelect) {
    formatSelect.value = "pantone";
  }
  if (generateFormatSelect) {
    generateFormatSelect.value = "pantone";
  }
};

export const setupColorNotationSelects = () => {
  const populate = (select: HTMLSelectElement | null, preserveSelection: boolean) => {
    if (!select) {
      return;
    }
    const selected = preserveSelection ? select.value : "hex";
    select.innerHTML = "";
    for (const notation of COLOR_NOTATIONS) {
      const option = document.createElement("option");
      option.value = notation.value;
      option.textContent = getColorNotationLabel(notation.value);
      select.appendChild(option);
    }
    select.value = selected || "hex";
  };
  populate(colorNotationSelect, false);
  populate(colorNotationEditorSelect, false);
};

export const refreshColorNotationSelects = () => {
  const populate = (select: HTMLSelectElement | null) => {
    if (!select) {
      return;
    }
    const selected = select.value;
    select.innerHTML = "";
    for (const notation of COLOR_NOTATIONS) {
      const option = document.createElement("option");
      option.value = notation.value;
      option.textContent = getColorNotationLabel(notation.value);
      select.appendChild(option);
    }
    select.value = selected || "hex";
  };
  populate(colorNotationSelect);
  populate(colorNotationEditorSelect);
};

export const hydratePreferences = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    applyTheme(themeSelect?.value ?? "system");
    applyMotionPreference(motionSelect?.value ?? "system", false);
    applyGenerateStylePreference();
    applyLanguagePreference(languageSelect?.value ?? "system", false);
    return;
  }
  try {
    const prefs = JSON.parse(raw) as Preferences;
    applyRemotePreferences(prefs);
  } catch {
    applyTheme(themeSelect?.value ?? "system");
    applyMotionPreference(motionSelect?.value ?? "system", false);
    applyGenerateStylePreference();
    applyLanguagePreference(languageSelect?.value ?? "system", false);
  }
};
