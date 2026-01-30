export const dropzone = document.querySelector<HTMLDivElement>("#dropzone");
export const fileInput = document.querySelector<HTMLInputElement>("#file-input");
export const formatSelect = document.querySelector<HTMLSelectElement>("#format");
export const addBwToggle = document.querySelector<HTMLInputElement>("#add-bw");
export const log = document.querySelector<HTMLDivElement>("#log");
export const loadingScreen =
  document.querySelector<HTMLDivElement>("#loading-screen");
export const versionBadge =
  document.querySelector<HTMLAnchorElement>("#app-version");
export const paletteList = document.querySelector<HTMLDivElement>("#palette-list");
export const paletteEditor =
  document.querySelector<HTMLDivElement>("#palette-editor");
export const palettePreview =
  document.querySelector<HTMLDivElement>("#palette-preview");
export const editorName = document.querySelector<HTMLDivElement>("#editor-name");
export const editorFooter =
  document.querySelector<HTMLDivElement>("#editor-footer");
export const editorSubtitle =
  document.querySelector<HTMLParagraphElement>("#editor-subtitle");
export const themeSelect =
  document.querySelector<HTMLSelectElement>("#theme-select");
export const colorNotationSelect =
  document.querySelector<HTMLSelectElement>("#color-notation");
export const colorNotationEditorSelect =
  document.querySelector<HTMLSelectElement>("#color-notation-editor");
export const autoRenameToggle =
  document.querySelector<HTMLInputElement>("#auto-rename-colors");
export const paletteNameInput =
  document.querySelector<HTMLInputElement>("#palette-name");
export const addColorButton =
  document.querySelector<HTMLButtonElement>("#add-color");
export const editorExportButton =
  document.querySelector<HTMLButtonElement>("#editor-export");
export const openSettingsButton =
  document.querySelector<HTMLButtonElement>("#open-settings");
export const openImportButton =
  document.querySelector<HTMLButtonElement>("#open-import");
export const openGenerateButton =
  document.querySelector<HTMLButtonElement>("#open-generate");
export const removeAllButton =
  document.querySelector<HTMLButtonElement>("#remove-all-palettes");
export const openExportButton =
  document.querySelector<HTMLButtonElement>("#open-export");
export const openViewButton =
  document.querySelector<HTMLButtonElement>("#open-view");
export const importModal =
  document.querySelector<HTMLDivElement>("#import-modal");
export const settingsModal =
  document.querySelector<HTMLDivElement>("#settings-modal");
export const generateModal =
  document.querySelector<HTMLDivElement>("#generate-modal");
export const editorModal =
  document.querySelector<HTMLDivElement>("#editor-modal");
export const exportModal =
  document.querySelector<HTMLDivElement>("#export-modal");
export const viewModal = document.querySelector<HTMLDivElement>("#view-modal");
export const generateNameInput =
  document.querySelector<HTMLInputElement>("#generate-name");
export const generateStyleSelect =
  document.querySelector<HTMLSelectElement>("#generate-style");
export const generateFormatSelect =
  document.querySelector<HTMLSelectElement>("#generate-format");
export const generateCountInput =
  document.querySelector<HTMLInputElement>("#generate-count");
export const generateUseBaseToggle =
  document.querySelector<HTMLInputElement>("#generate-use-base");
export const generateBaseColorInput =
  document.querySelector<HTMLInputElement>("#generate-base-color");
export const confirmGenerateButton =
  document.querySelector<HTMLButtonElement>("#confirm-generate");
export const generateEmptyButton =
  document.querySelector<HTMLButtonElement>("#generate-empty-button");
export const exportAllButton =
  document.querySelector<HTMLButtonElement>("#export-all");
export const exportFormatOptions = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="export-format"]')
);
export const exportActionButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-export-action]")
);
export const exportActionIcons = Array.from(
  document.querySelectorAll<HTMLSpanElement>(".action-icon[data-icon]")
);
export const viewDisplay =
  document.querySelector<HTMLDivElement>("#view-display");
export const viewValues = document.querySelector<HTMLDivElement>("#view-values");
export const viewStrip = document.querySelector<HTMLDivElement>("#view-strip");
export const viewSubtitle =
  document.querySelector<HTMLParagraphElement>("#view-subtitle");
export const viewEditButton =
  document.querySelector<HTMLButtonElement>("#view-edit");
