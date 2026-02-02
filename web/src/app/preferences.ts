import {
  addBwToggle,
  autoRenameToggle,
  colorNotationEditorSelect,
  colorNotationSelect,
  formatSelect,
  generateFormatSelect,
  themeSelect,
} from "./dom";
import { COLOR_NOTATIONS, STORAGE_KEY, VALID_NAME_FORMATS } from "./config";
import type { Preferences } from "./types";
import { getSelectedExportFormat, setSelectedExportFormat } from "./export/manager";
import { persistPreferences } from "./persistence";

let onNotationChange: (() => void) | null = null;

export const setColorNotationChangeHandler = (
  handler: (() => void) | null
) => {
  onNotationChange = handler;
};

export const getPreferencesPayload = (): Preferences => ({
  theme: themeSelect?.value ?? "studio",
  colorNameFormat: formatSelect?.value ?? generateFormatSelect?.value ?? "pantone",
  addBlackWhite: addBwToggle?.checked ?? false,
  exportFormat: getSelectedExportFormat(),
  colorNotation: getColorNotation(),
  autoRenameColors: autoRenameToggle?.checked ?? false,
});

export const getOptions = () => ({
  colorNameFormat: formatSelect?.value ?? "pantone",
  addBlackWhite: addBwToggle?.checked ?? false,
});

export const getColorNotation = () =>
  colorNotationSelect?.value ??
  colorNotationEditorSelect?.value ??
  "hex";

export const applyTheme = (theme: string) => {
  document.body.dataset.theme = theme;
  document.documentElement.dataset.theme = theme;
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

export const applyRemotePreferences = (prefs: Preferences) => {
  if (themeSelect && prefs.theme) {
    themeSelect.value = prefs.theme;
  }
  if (formatSelect && prefs.colorNameFormat) {
    formatSelect.value = prefs.colorNameFormat;
  }
  if (generateFormatSelect && prefs.colorNameFormat) {
    generateFormatSelect.value = prefs.colorNameFormat;
  }
  if (addBwToggle) {
    addBwToggle.checked = prefs.addBlackWhite ?? false;
  }
  if (autoRenameToggle) {
    autoRenameToggle.checked = prefs.autoRenameColors ?? false;
  }
  if (prefs.exportFormat) {
    setSelectedExportFormat(prefs.exportFormat);
  }
  if (prefs.colorNotation) {
    applyColorNotation(prefs.colorNotation, false);
  }
  applyTheme(themeSelect?.value ?? prefs.theme ?? "studio");
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
  const populate = (select: HTMLSelectElement | null) => {
    if (!select) {
      return;
    }
    select.innerHTML = "";
    for (const notation of COLOR_NOTATIONS) {
      const option = document.createElement("option");
      option.value = notation.value;
      option.textContent = notation.label;
      select.appendChild(option);
    }
  };
  populate(colorNotationSelect);
  populate(colorNotationEditorSelect);
  if (colorNotationSelect) {
    colorNotationSelect.value = "hex";
  }
  if (colorNotationEditorSelect) {
    colorNotationEditorSelect.value = "hex";
  }
};

export const hydratePreferences = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    applyTheme(themeSelect?.value ?? "studio");
    return;
  }
  try {
    const prefs = JSON.parse(raw) as Preferences;
    applyRemotePreferences(prefs);
  } catch {
    applyTheme(themeSelect?.value ?? "studio");
  }
};
