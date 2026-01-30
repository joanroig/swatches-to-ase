import JSZip from "jszip";
import {
  exportPaletteToAse,
  exportPaletteToGpl,
  exportPaletteToSwatches,
  readPaletteFile,
} from "@core/palette";

import {
  addBwToggle,
  addColorButton,
  autoRenameToggle,
  colorNotationEditorSelect,
  colorNotationSelect,
  confirmGenerateButton,
  dropzone,
  editorExportButton,
  editorFooter,
  editorModal,
  editorSubtitle,
  exportActionButtons,
  exportActionIcons,
  exportAllButton,
  exportFormatOptions,
  exportModal,
  fileInput,
  formatSelect,
  generateBaseColorInput,
  generateCountInput,
  generateEmptyButton,
  generateFormatSelect,
  generateModal,
  generateNameInput,
  generateStyleSelect,
  generateUseBaseToggle,
  importModal,
  loadingScreen,
  openExportButton,
  openGenerateButton,
  openImportButton,
  openSettingsButton,
  openViewButton,
  paletteEditor,
  paletteList,
  paletteNameInput,
  palettePreview,
  removeAllButton,
  settingsModal,
  themeSelect,
  versionBadge,
  viewDisplay,
  viewEditButton,
  viewModal,
  viewStrip,
  viewSubtitle,
  viewValues,
} from "./app/dom";
import {
  COLOR_NOTATIONS,
  PALETTES_KEY,
  STORAGE_KEY,
  VALID_NAME_FORMATS,
} from "./app/config";
import { dragState, exportState, state, viewState } from "./app/state";
import type { ExportMode, Palette, Preferences } from "./app/types";
import { generatePaletteColors } from "./app/palette/generation";
import {
  createGeneratedPaletteName,
  nameColor,
  resolveNameFormat,
} from "./app/palette/naming";
import { buildSharedPaletteUrl, decodeSharedPalette } from "./app/share";
import {
  buildCodeExport,
  buildCssExport,
  buildEmbedExport,
  buildSvgExport,
  buildTailwindExport,
} from "./app/export/builders";
import { setButtonContent, hydrateExportActionIcons } from "./app/ui/icons";
import { appendLog, showToast } from "./app/ui/notifications";
import { closeOpenModals, setModalOpen, setupModal } from "./app/ui/modals";
import { createId } from "./app/utils/id";
import {
  formatColorValue,
  getColorMetrics,
  getContrastColor,
  getHueFromHex,
  hexToRgb,
  normalizeHex,
  rgbToHex,
} from "./app/utils/color";
import { sanitizeFileName } from "./app/utils/text";

const updateProcessingState = (busy: boolean) => {
  state.processing = busy;
  dropzone?.classList.toggle("is-busy", busy);
};

const getOptions = () => ({
  colorNameFormat: formatSelect?.value ?? "pantone",
  addBlackWhite: addBwToggle?.checked ?? false,
});

const getColorNotation = () =>
  colorNotationSelect?.value ??
  colorNotationEditorSelect?.value ??
  "hex";

const persistPreferences = () => {
  const payload: Preferences = {
    theme: themeSelect?.value ?? "studio",
    colorNameFormat:
      formatSelect?.value ?? generateFormatSelect?.value ?? "pantone",
    addBlackWhite: addBwToggle?.checked ?? false,
    exportFormat: getSelectedExportFormat(),
    colorNotation: getColorNotation(),
    autoRenameColors: autoRenameToggle?.checked ?? false,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

const persistPalettes = () => {
  const payload = {
    palettes: state.palettes,
    activePaletteId: state.activePaletteId,
  };
  localStorage.setItem(PALETTES_KEY, JSON.stringify(payload));
};

const applyTheme = (theme: string) => {
  document.body.dataset.theme = theme;
  document.documentElement.dataset.theme = theme;
};

const waitForAppReady = async () => {
  if (document.readyState !== "complete") {
    await new Promise<void>((resolve) => {
      window.addEventListener("load", () => resolve(), { once: true });
    });
  }
  if ("fonts" in document) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font load errors
    }
  }
  requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
    loadingScreen?.setAttribute("aria-hidden", "true");
    loadingScreen?.setAttribute("aria-busy", "false");
  });
};


const getSelectedExportFormat = () =>
  exportFormatOptions.find((option) => option.checked)?.value ?? "all";

const setSelectedExportFormat = (format: string) => {
  const normalized = format.toLowerCase();
  const match = exportFormatOptions.find((option) => option.value === normalized);
  if (match) {
    match.checked = true;
  }
};

const setExportMode = (mode: ExportMode) => {
  exportState.mode = mode;
  if (exportModal) {
    exportModal.dataset.exportMode = mode;
  }
  updateExportAvailability();
};

const applyColorNotation = (value: string) => {
  const normalized = value || "hex";
  if (colorNotationSelect) {
    colorNotationSelect.value = normalized;
  }
  if (colorNotationEditorSelect) {
    colorNotationEditorSelect.value = normalized;
  }
  persistPreferences();
  renderEditor();
};

const getPaletteById = (paletteId: string | null) =>
  state.palettes.find((item) => item.id === paletteId);

const getPrimaryExportPalette = () => {
  const targets = getExportTargets();
  if (targets.length === 1) {
    return targets[0];
  }
  return getPaletteById(state.activePaletteId) ?? targets[0] ?? null;
};

const openViewForPalette = (paletteId: string) => {
  syncActivePalette(paletteId);
  viewState.paletteId = paletteId;
  viewState.colorId = null;
  renderViewModal();
  setModalOpen(viewModal, true);
};

const renderViewModal = () => {
  if (!viewDisplay || !viewValues || !viewStrip || !viewSubtitle) {
    return;
  }
  const palette = getPaletteById(viewState.paletteId ?? state.activePaletteId);
  viewValues.innerHTML = "";
  viewStrip.innerHTML = "";

  if (!palette) {
    viewState.paletteId = null;
    viewState.colorId = null;
    viewDisplay.classList.add("is-empty");
    viewDisplay.style.background = "";
    viewDisplay.style.color = "";
    viewSubtitle.textContent = "Select a palette to preview.";
    viewValues.textContent = "No palette selected.";
    return;
  }

  viewSubtitle.textContent = `${palette.name} • ${palette.colors.length} colors`;

  if (palette.colors.length === 0) {
    viewState.colorId = null;
    viewDisplay.classList.add("is-empty");
    viewDisplay.style.background = "";
    viewDisplay.style.color = "";
    viewValues.textContent = "Empty palette. Add colors to preview.";
    return;
  }

  const activeColor =
    palette.colors.find((color) => color.id === viewState.colorId) ??
    palette.colors[0];
  viewState.colorId = activeColor.id;
  const hex = rgbToHex(activeColor.rgb).toUpperCase();
  const { r, g, b, hsb, hsl, cmyk, lab } = getColorMetrics(activeColor.rgb);
  const [hsbH, hsbS, hsbV] = hsb;
  const [hslH, hslS, hslL] = hsl;
  const [c, m, y, k] = cmyk;
  const [labL, labA, labB] = lab;

  viewDisplay.classList.remove("is-empty");
  viewDisplay.style.background = hex;
  viewDisplay.style.color = getContrastColor(activeColor.rgb);

  const values = [
    { label: "HEX", value: hex.replace("#", "") },
    { label: "HSB", value: `${Math.round(hsbH)}, ${Math.round(hsbS)}, ${Math.round(hsbV)}` },
    { label: "HSL", value: `${Math.round(hslH)}, ${Math.round(hslS)}, ${Math.round(hslL)}` },
    { label: "RGB", value: `${r}, ${g}, ${b}` },
    { label: "CMYK", value: `${Math.round(c)}, ${Math.round(m)}, ${Math.round(y)}, ${Math.round(k)}` },
    { label: "LAB", value: `${Math.round(labL)}, ${Math.round(labA)}, ${Math.round(labB)}` },
  ];

  values.forEach((item) => {
    const row = document.createElement("div");
    row.className = "view-value";
    const label = document.createElement("span");
    label.className = "view-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    value.className = "view-data";
    value.textContent = item.value;
    row.append(label, value);
    viewValues.appendChild(row);
  });

  palette.colors.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "view-swatch";
    if (color.id === viewState.colorId) {
      swatch.classList.add("is-active");
    }
    swatch.style.background = rgbToHex(color.rgb);
    swatch.setAttribute("aria-label", color.name);
    swatch.title = color.name;
    swatch.addEventListener("click", () => {
      viewState.colorId = color.id;
      renderViewModal();
    });
    viewStrip.appendChild(swatch);
  });
};

const updateExportAvailability = () => {
  const hasPalettes = state.palettes.length > 0;
  if (openExportButton) {
    openExportButton.disabled = !hasPalettes;
  }
  if (removeAllButton) {
    removeAllButton.disabled = !hasPalettes;
  }
  if (exportAllButton) {
    exportAllButton.disabled = !hasPalettes;
  }
  exportActionButtons.forEach((button) => {
    button.disabled = !hasPalettes || exportState.mode === "batch";
  });
};

const syncActivePalette = (paletteId: string | null) => {
  state.activePaletteId = paletteId;
  renderPaletteList();
  renderEditor();
  updateExportAvailability();
  persistPalettes();
};

const openEditorForPalette = (paletteId: string) => {
  syncActivePalette(paletteId);
  setModalOpen(editorModal, true);
};

const renderPaletteList = () => {
  if (!paletteList) {
    return;
  }
  paletteList.innerHTML = "";
  if (state.palettes.length === 0) {
    paletteList.innerHTML =
      "<p class=\"empty\">No palettes loaded yet.</p>";
    updateExportAvailability();
    return;
  }

  for (const palette of state.palettes) {
    const card = document.createElement("article");
    card.className =
      palette.id === state.activePaletteId
        ? "palette-card is-active"
        : "palette-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.addEventListener("click", () => syncActivePalette(palette.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        syncActivePalette(palette.id);
      }
    });

    const header = document.createElement("div");
    header.className = "palette-card-header";

    const meta = document.createElement("div");

    const title = document.createElement("div");
    title.className = "palette-title";
    title.textContent = palette.name;

    const count = document.createElement("span");
    count.className = "palette-count";
    count.textContent = `${palette.colors.length} colors`;

    meta.append(title, count);

    const actions = document.createElement("div");
    actions.className = "palette-actions";
    const viewButton = document.createElement("button");
    viewButton.className = "ghost";
    setButtonContent(viewButton, "view", "View");
    viewButton.setAttribute("aria-label", "View");
    viewButton.title = "View";
    viewButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openViewForPalette(palette.id);
    });

    const editButton = document.createElement("button");
    editButton.className = "ghost";
    setButtonContent(editButton, "edit", "Edit");
    editButton.setAttribute("aria-label", "Edit");
    editButton.title = "Edit";
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openEditorForPalette(palette.id);
    });

    const exportButton = document.createElement("button");
    exportButton.className = "ghost";
    setButtonContent(exportButton, "export", "Export");
    exportButton.setAttribute("aria-label", "Export");
    exportButton.title = "Export";
    exportButton.addEventListener("click", (event) => {
      event.stopPropagation();
      syncActivePalette(palette.id);
      setExportMode("single");
      setModalOpen(exportModal, true);
    });

    const removeButton = document.createElement("button");
    removeButton.className = "ghost";
    setButtonContent(removeButton, "trash", "Remove");
    removeButton.setAttribute("aria-label", "Remove");
    removeButton.title = "Remove";
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const confirmed = window.confirm(
        `Remove \"${palette.name}\"? This cannot be undone.`
      );
      if (!confirmed) {
        return;
      }
      state.palettes = state.palettes.filter((item) => item.id !== palette.id);
      syncActivePalette(state.palettes[0]?.id ?? null);
    });

    actions.append(viewButton, editButton, exportButton, removeButton);

    header.append(meta);

    const chips = document.createElement("div");
    chips.className = "palette-chips";
    if (palette.colors.length === 0) {
      chips.classList.add("is-empty");
      const empty = document.createElement("span");
      empty.className = "empty";
      empty.textContent = "No colors yet.";
      chips.appendChild(empty);
    } else {
      const previewColors = palette.colors.slice(0, 10);
      const remaining = palette.colors.length - previewColors.length;
      previewColors.forEach((color) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.style.background = rgbToHex(color.rgb);
        chips.appendChild(chip);
      });
      if (remaining > 0) {
        const more = document.createElement("span");
        more.className = "chip chip-more";
        more.textContent = `+${remaining}`;
        more.title = `${remaining} more colors`;
        chips.appendChild(more);
      }
    }

    const footer = document.createElement("div");
    footer.className = "palette-card-footer";
    footer.append(actions);

    card.append(header, chips, footer);
    paletteList.appendChild(card);
  }
  updateExportAvailability();
  renderViewModal();
};

const updatePalette = (paletteId: string, updater: (palette: Palette) => void) => {
  const palette = state.palettes.find((item) => item.id === paletteId);
  if (!palette) {
    return;
  }
  updater(palette);
  renderPaletteList();
  renderEditor();
  updateExportAvailability();
  persistPalettes();
};

const updatePaletteName = (paletteId: string, nextName: string) => {
  const palette = state.palettes.find((item) => item.id === paletteId);
  if (!palette) {
    return;
  }
  palette.name = nextName;
  renderPaletteList();
  if (editorSubtitle) {
    editorSubtitle.textContent = `${palette.name} • ${palette.colors.length} colors`;
  }
  renderViewModal();
  persistPalettes();
};

const updateColorName = (
  paletteId: string,
  colorId: string,
  nextName: string,
  notation: string
) => {
  const palette = state.palettes.find((item) => item.id === paletteId);
  if (!palette) {
    return;
  }
  const target = palette.colors.find((entry) => entry.id === colorId);
  if (!target) {
    return;
  }
  target.name = nextName;
  persistPalettes();

  const preview = palettePreview?.querySelector<HTMLDivElement>(
    `[data-color-id="${colorId}"]`
  );
  if (!preview) {
    return;
  }
  const previewName = preview.querySelector<HTMLElement>(".preview-name");
  if (previewName) {
    previewName.textContent = nextName;
  }
  const previewHex = preview.querySelector<HTMLElement>(".preview-hex");
  if (previewHex) {
    previewHex.textContent = formatColorValue(
      { ...target, name: nextName },
      notation
    );
  }
  preview.title = `${nextName} ${rgbToHex(target.rgb).toUpperCase()}`;
  renderViewModal();
};

const moveColorToIndex = (
  paletteId: string,
  colorId: string,
  targetIndex: number
) => {
  updatePalette(paletteId, (item) => {
    const fromIndex = item.colors.findIndex((entry) => entry.id === colorId);
    if (fromIndex < 0) {
      return;
    }
    const boundedIndex = Math.max(0, Math.min(targetIndex, item.colors.length));
    if (fromIndex === boundedIndex) {
      return;
    }
    const [moved] = item.colors.splice(fromIndex, 1);
    const insertIndex =
      fromIndex < boundedIndex ? boundedIndex - 1 : boundedIndex;
    item.colors.splice(insertIndex, 0, moved);
  });
};

const renderEditor = () => {
  if (!paletteEditor) {
    return;
  }
  const palette = state.palettes.find(
    (item) => item.id === state.activePaletteId
  );

  paletteEditor.innerHTML = "";
  if (palettePreview) {
    palettePreview.innerHTML = "";
  }
  if (editorFooter) {
    editorFooter.classList.toggle("is-hidden", !palette);
  }
  if (addColorButton) {
    addColorButton.disabled = !palette;
  }
  if (editorExportButton) {
    editorExportButton.disabled = !palette;
  }

  if (!palette) {
    paletteEditor.innerHTML =
      "<p class=\"empty\">Select a palette to preview and edit.</p>";
    if (palettePreview) {
      palettePreview.innerHTML =
        "<p class=\"empty\">No palette selected.</p>";
    }
    if (editorSubtitle) {
      editorSubtitle.textContent = "Select a palette to begin.";
    }
    if (paletteNameInput) {
      paletteNameInput.value = "";
      paletteNameInput.disabled = true;
      delete paletteNameInput.dataset.paletteId;
    }
    return;
  }

  const notation = getColorNotation();

  if (editorSubtitle) {
    editorSubtitle.textContent = `${palette.name} • ${palette.colors.length} colors`;
  }

  if (paletteNameInput) {
    const isEditing = document.activeElement === paletteNameInput;
    const isSamePalette = paletteNameInput.dataset.paletteId === palette.id;
    if (!isEditing || !isSamePalette) {
      paletteNameInput.value = palette.name;
    }
    paletteNameInput.disabled = false;
    paletteNameInput.dataset.paletteId = palette.id;
  }

  if (palettePreview) {
    if (palette.colors.length === 0) {
      palettePreview.innerHTML =
        "<p class=\"empty\">Empty palette. Add colors to preview.</p>";
    } else {
      palette.colors.forEach((color) => {
        const swatch = document.createElement("div");
        swatch.className = "preview-swatch";
        swatch.dataset.colorId = color.id;
        swatch.style.background = rgbToHex(color.rgb);
        swatch.style.color = getContrastColor(color.rgb);
        swatch.title = `${color.name} ${rgbToHex(color.rgb).toUpperCase()}`;

        const name = document.createElement("span");
        name.className = "preview-name";
        name.textContent = color.name;
        const hex = document.createElement("small");
        hex.className = "preview-hex";
        hex.textContent = formatColorValue(color, notation);

        swatch.append(name, hex);
        palettePreview.appendChild(swatch);
      });
    }
  }

  const list = document.createElement("div");
  list.className = "color-list";
  const dropTarget = document.createElement("div");
  dropTarget.className = "color-drop-target";
  dropTarget.textContent = "Drop to place at end";

  const resetDragClasses = () => {
    list.querySelectorAll(".color-row").forEach((row) => {
      row.classList.remove("is-dragover");
      row.classList.remove("is-dragging");
    });
    dropTarget.classList.remove("is-dragover");
    list.classList.remove("is-dragging");
  };

  list.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  });

  list.addEventListener("drop", (event) => {
    event.preventDefault();
    const paletteId = dragState.paletteId ?? palette.id;
    const colorId = dragState.colorId ?? event.dataTransfer?.getData("text/plain");
    if (!paletteId || !colorId) {
      resetDragClasses();
      return;
    }
    moveColorToIndex(paletteId, colorId, palette.colors.length);
    resetDragClasses();
  });

  dropTarget.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropTarget.classList.add("is-dragover");
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  });

  dropTarget.addEventListener("dragleave", () => {
    dropTarget.classList.remove("is-dragover");
  });

  dropTarget.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const paletteId = dragState.paletteId ?? palette.id;
    const colorId = dragState.colorId ?? event.dataTransfer?.getData("text/plain");
    if (!paletteId || !colorId) {
      resetDragClasses();
      return;
    }
    moveColorToIndex(paletteId, colorId, palette.colors.length);
    resetDragClasses();
  });

  palette.colors.forEach((color) => {
    const row = document.createElement("div");
    row.className = "color-row";
    row.dataset.colorId = color.id;
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      row.classList.add("is-dragover");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("is-dragover");
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const paletteId = dragState.paletteId ?? palette.id;
      const fromId =
        dragState.colorId ?? event.dataTransfer?.getData("text/plain");
      if (!paletteId || !fromId || fromId === color.id) {
        resetDragClasses();
        return;
      }
      const targetIndex = palette.colors.findIndex(
        (entry) => entry.id === color.id
      );
      if (targetIndex >= 0) {
        moveColorToIndex(paletteId, fromId, targetIndex);
      }
      resetDragClasses();
    });

    const swatch = document.createElement("input");
    swatch.type = "color";
    swatch.value = rgbToHex(color.rgb);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = color.name;
    nameInput.placeholder = "Color name";
    nameInput.addEventListener("input", () => {
      const nextName = nameInput.value.trim() || "Unnamed color";
      updateColorName(palette.id, color.id, nextName, notation);
      valueLabel.textContent = formatColorValue(
        { ...color, name: nextName },
        notation
      );
    });

    const meta = document.createElement("div");
    meta.className = "color-meta";

    const valueLabel = document.createElement("span");
    valueLabel.className = "color-hex";
    valueLabel.textContent = formatColorValue(color, notation);

    meta.append(nameInput, valueLabel);

    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "ghost drag-handle";
    dragHandle.draggable = true;
    setButtonContent(dragHandle, "grip", "Drag to reorder", true);
    dragHandle.addEventListener("dragstart", (event) => {
      dragState.paletteId = palette.id;
      dragState.colorId = color.id;
      row.classList.add("is-dragging");
      list.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", color.id);
      }
    });
    dragHandle.addEventListener("dragend", () => {
      dragState.paletteId = null;
      dragState.colorId = null;
      resetDragClasses();
    });

    const actions = document.createElement("div");
    actions.className = "color-actions";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost";
    setButtonContent(removeButton, "trash", "Remove");
    removeButton.addEventListener("click", () => {
      updatePalette(palette.id, (item) => {
        item.colors = item.colors.filter((entry) => entry.id !== color.id);
      });
    });

    actions.append(removeButton);
    row.append(dragHandle, swatch, meta, actions);

    swatch.addEventListener("input", () => {
      const nextRgb = hexToRgb(swatch.value);
      const target = palette.colors.find((entry) => entry.id === color.id);
      if (target) {
        target.rgb = nextRgb;
      }
      if (autoRenameToggle?.checked) {
        const nextName = nameColor(
          swatch.value.toUpperCase(),
          resolveNameFormat(formatSelect?.value ?? "pantone"),
          0
        );
        if (target) {
          target.name = nextName;
        }
        nameInput.value = nextName;
      }
      valueLabel.textContent = formatColorValue(
        { ...color, rgb: nextRgb, name: nameInput.value },
        notation
      );
      const preview = palettePreview?.querySelector<HTMLDivElement>(
        `[data-color-id="${color.id}"]`
      );
      if (preview) {
        preview.style.background = swatch.value;
        preview.style.color = getContrastColor(nextRgb);
        const previewHex = preview.querySelector<HTMLElement>(".preview-hex");
        if (previewHex) {
          previewHex.textContent = formatColorValue(
            { ...color, rgb: nextRgb, name: nameInput.value },
            notation
          );
        }
        const previewName = preview.querySelector<HTMLElement>(".preview-name");
        if (previewName) {
          previewName.textContent = nameInput.value;
        }
        preview.title = `${nameInput.value} ${rgbToHex(nextRgb).toUpperCase()}`;
      }
      renderViewModal();
    });
    swatch.addEventListener("change", () => {
      updatePalette(palette.id, (item) => {
        const target = item.colors.find((entry) => entry.id === color.id);
        if (target) {
          target.rgb = hexToRgb(swatch.value);
        }
      });
    });
    list.appendChild(row);
  });

  list.appendChild(dropTarget);
  paletteEditor.appendChild(list);
  updateExportAvailability();
  renderViewModal();
};

const downloadBlob = (fileName: string, data: BlobPart, mime: string) => {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const exportSinglePalette = async (palette: Palette, formatOverride?: string) => {
  const format = formatOverride ?? getSelectedExportFormat();
  const cleanName = sanitizeFileName(palette.name);
  const payload = {
    name: palette.name,
    colors: palette.colors.map((color) => ({
      name: color.name,
      rgb: color.rgb,
    })),
  };

  if (format === "all") {
    await exportSinglePalette(palette, "ase");
    await exportSinglePalette(palette, "swatches");
    await exportSinglePalette(palette, "gpl");
    return;
  }

  if (format === "swatches") {
    const data = await exportPaletteToSwatches(payload);
    downloadBlob(`${cleanName}.swatches`, data, "application/octet-stream");
    return;
  }
  if (format === "gpl") {
    const data = exportPaletteToGpl(payload);
    downloadBlob(`${cleanName}.gpl`, data, "text/plain");
    return;
  }
  const data = exportPaletteToAse(payload);
  downloadBlob(`${cleanName}.ase`, data, "application/octet-stream");
};

const getPaletteForExportAction = () => {
  const palette = getPrimaryExportPalette();
  if (!palette) {
    appendLog("No palette selected for export.", "error");
    return null;
  }
  if (palette.colors.length === 0) {
    appendLog("Selected palette has no colors.", "error");
    return null;
  }
  return palette;
};

const getPaletteHexes = (palette: Palette) =>
  palette.colors.map((color) =>
    rgbToHex(color.rgb).replace("#", "").toLowerCase()
  );

const copyToClipboard = async (text: string, successMessage: string) => {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(text);
    appendLog(successMessage, "success");
    showToast(successMessage, "success");
  } catch (error) {
    const message = `Clipboard unavailable: ${(error as Error).message}`;
    appendLog(message, "error");
    showToast(message, "error");
  }
};

const downloadText = (fileName: string, content: string, mime: string) => {
  downloadBlob(fileName, content, mime);
  appendLog(`Downloaded ${fileName}`, "success");
};

const downloadPng = async (palette: Palette) => {
  const width = Math.max(1, palette.colors.length) * 160;
  const height = 160;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    appendLog("Unable to render image.", "error");
    return;
  }
  palette.colors.forEach((color, index) => {
    context.fillStyle = rgbToHex(color.rgb);
    context.fillRect(index * 160, 0, 160, height);
  });
  canvas.toBlob((blob) => {
    if (!blob) {
      appendLog("Unable to generate image file.", "error");
      return;
    }
    downloadBlob(`${sanitizeFileName(palette.name)}.png`, blob, "image/png");
    appendLog("Downloaded palette image.", "success");
  }, "image/png");
};

const openPrintExport = (palette: Palette) => {
  const html = `
    <html>
      <head>
        <title>${palette.name} palette</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; }
          h1 { font-size: 20px; }
          .row { display: flex; gap: 6px; margin-top: 20px; }
          .swatch { flex: 1 1 0; height: 90px; border-radius: 8px; }
          .label { margin-top: 12px; font-size: 12px; color: #555; }
        </style>
      </head>
      <body>
        <h1>${palette.name}</h1>
        <div class="row">
          ${palette.colors
            .map(
              (color) =>
                `<div class="swatch" style="background:${rgbToHex(
                  color.rgb
                ).toUpperCase()}"></div>`
            )
            .join("")}
        </div>
        <div class="label">Generated from Palette Studio</div>
      </body>
    </html>
  `;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    appendLog("Unable to open print preview.", "error");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

const openShareLink = (url: string, text: string) => {
  const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(
    text
  )}&url=${encodeURIComponent(url)}`;
  window.open(shareUrl, "_blank");
};

const openPinterestLink = (url: string, description: string) => {
  const pinUrl = `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(
    url
  )}&description=${encodeURIComponent(description)}`;
  window.open(pinUrl, "_blank");
};

const handleExportAction = async (action: string | undefined) => {
  const palette = getPaletteForExportAction();
  if (!palette || !action) {
    return;
  }
  const cleanName = sanitizeFileName(palette.name);
  const coolorsUrl = `https://coolors.co/${getPaletteHexes(palette).join("-")}`;
  const shareUrl = buildSharedPaletteUrl(palette);

  switch (action) {
    case "url":
      await copyToClipboard(shareUrl, "Share URL copied to clipboard.");
      break;
    case "share":
      if (navigator.share) {
        try {
          await navigator.share({
            title: palette.name,
            text: `${palette.name} palette`,
            url: shareUrl,
          });
          appendLog("Share sheet opened.", "success");
        } catch (error) {
          appendLog(`Share canceled: ${(error as Error).message}`, "info");
        }
      } else {
        await copyToClipboard(shareUrl, "Share URL copied to clipboard.");
      }
      break;
    case "pdf":
      openPrintExport(palette);
      break;
    case "image":
      await downloadPng(palette);
      break;
    case "css": {
      const css = buildCssExport(palette);
      downloadText(`${cleanName}.css`, css, "text/css");
      await copyToClipboard(css, "CSS variables copied to clipboard.");
      break;
    }
    case "svg": {
      const svg = buildSvgExport(palette);
      downloadText(`${cleanName}.svg`, svg, "image/svg+xml");
      await copyToClipboard(svg, "SVG copied to clipboard.");
      break;
    }
    case "code": {
      const code = buildCodeExport(palette);
      downloadText(`${cleanName}.json`, code, "application/json");
      await copyToClipboard(code, "Code copied to clipboard.");
      break;
    }
    case "tailwind": {
      const tailwind = buildTailwindExport(palette);
      downloadText(`${cleanName}.tailwind.js`, tailwind, "text/javascript");
      await copyToClipboard(tailwind, "Tailwind config copied to clipboard.");
      break;
    }
    case "embed": {
      const embed = buildEmbedExport(palette);
      downloadText(`${cleanName}.html`, embed, "text/html");
      await copyToClipboard(embed, "Embed snippet copied to clipboard.");
      break;
    }
    case "coolors":
      window.open(coolorsUrl, "_blank");
      break;
    case "x":
      openShareLink(shareUrl, `${palette.name} palette`);
      break;
    case "pinterest":
      openPinterestLink(shareUrl, `${palette.name} palette`);
      break;
    default:
      appendLog("Export action not available yet.", "error");
  }
};

const getExportTargets = () => {
  if (exportState.mode === "single") {
    const palette =
      getPaletteById(state.activePaletteId) ?? state.palettes[0] ?? null;
    return palette ? [palette] : [];
  }
  return [...state.palettes];
};

const exportPalettes = async (palettes: Palette[]) => {
  if (palettes.length === 0) {
    appendLog("No palettes to export yet.", "error");
    return;
  }
  updateProcessingState(true);
  const format = getSelectedExportFormat();
  const zip = new JSZip();
  appendLog(`Exporting ${palettes.length} palette(s)...`, "info");

  try {
    for (const palette of palettes) {
      const cleanName = sanitizeFileName(palette.name);
      const payload = {
        name: palette.name,
        colors: palette.colors.map((color) => ({
          name: color.name,
          rgb: color.rgb,
        })),
      };

      if (format === "all") {
        const ase = exportPaletteToAse(payload);
        const gpl = exportPaletteToGpl(payload);
        const swatches = await exportPaletteToSwatches(payload);
        zip.file(`${cleanName}.ase`, ase);
        zip.file(`${cleanName}.gpl`, gpl);
        zip.file(`${cleanName}.swatches`, swatches);
      } else if (format === "swatches") {
        const data = await exportPaletteToSwatches(payload);
        zip.file(`${cleanName}.swatches`, data);
      } else if (format === "gpl") {
        const data = exportPaletteToGpl(payload);
        zip.file(`${cleanName}.gpl`, data);
      } else {
        const data = exportPaletteToAse(payload);
        zip.file(`${cleanName}.ase`, data);
      }
    }

    const zipBytes = await zip.generateAsync({ type: "uint8array" });
    const saveResult = await window.desktopApi?.saveZip?.({
      fileName: `palette-studio.${format}.zip`,
      data: zipBytes,
    });

    if (saveResult?.saved) {
      appendLog("Zip file saved on desktop.", "success");
    } else if (window.desktopApi) {
      appendLog("Zip save canceled.", "info");
    } else {
      const blob = new Blob([zipBytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `palette-studio.${format}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      appendLog("Zip file ready for download.", "success");
    }
  } finally {
    updateProcessingState(false);
  }
};

const exportPalettesSmart = async (palettes: Palette[]) => {
  if (palettes.length === 0) {
    appendLog("No palettes to export yet.", "error");
    return;
  }
  const format = getSelectedExportFormat();
  if (palettes.length > 1 || format === "all") {
    await exportPalettes(palettes);
    return;
  }
  await exportSinglePalette(palettes[0]);
};

const handleFiles = async (fileList: FileList | null) => {
  if (!fileList || state.processing) {
    return;
  }
  const files = Array.from(fileList).filter((file) =>
    [".swatches", ".ase", ".gpl"].some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    )
  );
  if (files.length === 0) {
    appendLog("No supported palette files detected.", "error");
    return;
  }

  updateProcessingState(true);
  appendLog(`Importing ${files.length} palette(s)...`, "info");

  try {
    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const paletteData = await readPaletteFile(buffer, file.name, getOptions());
        const palette: Palette = {
          id: createId(),
          name: paletteData.name,
          colors: paletteData.colors.map((color) => ({
            id: createId(),
            name: color.name,
            rgb: color.rgb,
          })),
        };
        state.palettes.push(palette);
        appendLog(`Loaded ${file.name}`, "success");
      } catch (error) {
        appendLog(
          `Failed to import ${file.name}: ${(error as Error).message}`,
          "error"
        );
      }
    }
  } finally {
    updateProcessingState(false);
    if (!state.activePaletteId && state.palettes.length > 0) {
      syncActivePalette(state.palettes[0].id);
    } else {
      renderPaletteList();
      renderEditor();
      updateExportAvailability();
      persistPalettes();
    }
  }
};

const setupDropzone = () => {
  if (!dropzone || !fileInput) {
    return;
  }

  dropzone.addEventListener("click", () => {
    if (!state.processing) {
      fileInput.click();
    }
  });

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!state.processing) {
      dropzone.classList.add("is-dragover");
    }
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("is-dragover");
  });

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
    if (state.processing) {
      return;
    }
    const files = event.dataTransfer?.files;
    if (files) {
      void handleFiles(files);
    }
  });

  fileInput.addEventListener("change", () => void handleFiles(fileInput.files));
};

const syncNameFormat = (value: string) => {
  if (formatSelect) {
    formatSelect.value = value;
  }
  if (generateFormatSelect) {
    generateFormatSelect.value = value;
  }
  persistPreferences();
};

const setupFormatSelects = () => {
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

const setupColorNotationSelects = () => {
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

const setupVersionBadge = () => {
  if (!versionBadge) {
    return;
  }
  versionBadge.textContent = `v${__APP_VERSION__}`;
};

const syncBaseColorState = () => {
  if (generateBaseColorInput) {
    generateBaseColorInput.disabled =
      !(generateUseBaseToggle?.checked ?? false);
  }
};

const createGeneratedPalette = (isEmpty: boolean) => {
  const style = generateStyleSelect?.value ?? "analogous";
  const rawCount = Number(generateCountInput?.value ?? 5);
  const count = Math.max(
    1,
    Math.min(Number.isFinite(rawCount) ? Math.round(rawCount) : 5, 16)
  );
  const nameFormat = resolveNameFormat(
    generateFormatSelect?.value ?? formatSelect?.value ?? "pantone"
  );
  const useBase = generateUseBaseToggle?.checked ?? false;
  const baseHex = useBase ? generateBaseColorInput?.value : null;
  const baseHue = baseHex ? getHueFromHex(baseHex) : undefined;
  const colors = isEmpty
    ? []
    : generatePaletteColors(style, count, nameFormat, baseHue);
  const mainHex =
    baseHex ??
    (colors[0] ? rgbToHex(colors[0].rgb).toUpperCase() : "");
  const generatedName =
    isEmpty || !mainHex
      ? "Empty Palette"
      : createGeneratedPaletteName(style, mainHex, nameFormat);
  return {
    id: createId(),
    name: generateNameInput?.value.trim() || generatedName,
    colors,
  } as Palette;
};

const setupActions = () => {
  setButtonContent(openSettingsButton, "settings", "Settings");
  setButtonContent(openImportButton, "import", "Import");
  setButtonContent(openGenerateButton, "generate", "Generate");
  setButtonContent(removeAllButton, "trash", "Remove all");
  setButtonContent(openExportButton, "export", "Batch export");
  setButtonContent(openViewButton, "view", "View");
  setButtonContent(editorExportButton, "export", "Export");
  setButtonContent(addColorButton, "plus", "Add color");
  setButtonContent(exportAllButton, "download", "Download");
  setButtonContent(confirmGenerateButton, "generate", "Create palette");
  setButtonContent(generateEmptyButton, "plus", "Create empty palette");
  setButtonContent(viewEditButton, "edit", "Edit");
  hydrateExportActionIcons(exportActionIcons);

  openSettingsButton?.addEventListener("click", () => {
    setModalOpen(settingsModal, true);
  });

  openImportButton?.addEventListener("click", () => {
    setModalOpen(importModal, true);
  });

  openGenerateButton?.addEventListener("click", () => {
    syncBaseColorState();
    setModalOpen(generateModal, true);
  });

  removeAllButton?.addEventListener("click", () => {
    if (state.palettes.length === 0) {
      return;
    }
    const confirmed = window.confirm(
      "Remove all palettes? This cannot be undone."
    );
    if (!confirmed) {
      return;
    }
    state.palettes = [];
    syncActivePalette(null);
  });

  openExportButton?.addEventListener("click", () => {
    if (state.palettes.length === 0) {
      return;
    }
    setExportMode("batch");
    setSelectedExportFormat("all");
    setModalOpen(exportModal, true);
  });

  editorExportButton?.addEventListener("click", () => {
    if (!state.activePaletteId) {
      return;
    }
    setExportMode("single");
    setModalOpen(exportModal, true);
  });

  openViewButton?.addEventListener("click", () => {
    if (!state.activePaletteId) {
      return;
    }
    setModalOpen(editorModal, false);
    openViewForPalette(state.activePaletteId);
  });

  addColorButton?.addEventListener("click", () => {
    if (!state.activePaletteId) {
      return;
    }
    updatePalette(state.activePaletteId, (item) => {
      item.colors.push({
        id: createId(),
        name: `Color ${item.colors.length + 1}`,
        rgb: [0.5, 0.5, 0.5],
      });
    });
  });

  paletteNameInput?.addEventListener("input", () => {
    const paletteId =
      paletteNameInput.dataset.paletteId ?? state.activePaletteId;
    if (!paletteId) {
      return;
    }
    const nextName = paletteNameInput.value.trim() || "Untitled Palette";
    updatePaletteName(paletteId, nextName);
  });

  paletteNameInput?.addEventListener("blur", () => {
    if (!paletteNameInput.value.trim()) {
      const paletteId =
        paletteNameInput.dataset.paletteId ?? state.activePaletteId;
      if (!paletteId) {
        return;
      }
      const fallbackName = "Untitled Palette";
      paletteNameInput.value = fallbackName;
      updatePaletteName(paletteId, fallbackName);
    }
  });

  confirmGenerateButton?.addEventListener("click", () => {
    const palette = createGeneratedPalette(false);
    state.palettes.unshift(palette);
    syncActivePalette(palette.id);
    appendLog("Generated a new palette.", "success");
    setModalOpen(generateModal, false);
  });

  generateEmptyButton?.addEventListener("click", () => {
    const palette = createGeneratedPalette(true);
    state.palettes.unshift(palette);
    syncActivePalette(palette.id);
    appendLog("Generated an empty palette.", "success");
    setModalOpen(generateModal, false);
  });

  exportAllButton?.addEventListener("click", () => {
    const targets = getExportTargets();
    if (targets.length === 0) {
      appendLog("No palettes to export yet.", "error");
      return;
    }
    void exportPalettesSmart(targets);
  });

  exportActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      void handleExportAction(button.dataset.exportAction);
    });
  });

  viewEditButton?.addEventListener("click", () => {
    if (!viewState.paletteId || !getPaletteById(viewState.paletteId)) {
      return;
    }
    setModalOpen(viewModal, false);
    openEditorForPalette(viewState.paletteId);
  });

  formatSelect?.addEventListener("change", () =>
    syncNameFormat(formatSelect.value)
  );
  generateFormatSelect?.addEventListener("change", () =>
    syncNameFormat(generateFormatSelect.value)
  );
  addBwToggle?.addEventListener("change", persistPreferences);
  exportFormatOptions.forEach((option) =>
    option.addEventListener("change", persistPreferences)
  );
  colorNotationSelect?.addEventListener("change", () =>
    applyColorNotation(colorNotationSelect.value)
  );
  colorNotationEditorSelect?.addEventListener("change", () =>
    applyColorNotation(colorNotationEditorSelect.value)
  );
  autoRenameToggle?.addEventListener("change", persistPreferences);
  themeSelect?.addEventListener("change", () => {
    applyTheme(themeSelect.value);
    persistPreferences();
  });
  generateUseBaseToggle?.addEventListener("change", syncBaseColorState);

  setupModal(importModal);
  setupModal(settingsModal);
  setupModal(generateModal);
  setupModal(editorModal);
  setupModal(exportModal);
  setupModal(viewModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOpenModals([
        importModal,
        settingsModal,
        generateModal,
        editorModal,
        exportModal,
        viewModal,
      ]);
    }
  });
};

const hydratePreferences = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    applyTheme(themeSelect?.value ?? "studio");
    return;
  }
  try {
    const prefs = JSON.parse(raw) as Preferences;
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
      applyColorNotation(prefs.colorNotation);
    }
    applyTheme(themeSelect?.value ?? prefs.theme ?? "studio");
  } catch {
    applyTheme(themeSelect?.value ?? "studio");
  }
};

const hydratePalettes = () => {
  const raw = localStorage.getItem(PALETTES_KEY);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw) as {
      palettes?: Palette[];
      activePaletteId?: string | null;
    };
    if (Array.isArray(parsed.palettes)) {
      state.palettes = parsed.palettes;
    }
    state.activePaletteId = parsed.activePaletteId ?? state.activePaletteId;
  } catch {
    // Ignore invalid saved palettes
  }
};

const importSharedPaletteFromUrl = () => {
  let url: URL;
  try {
    url = new URL(window.location.href);
  } catch {
    return;
  }
  const encoded = url.searchParams.get("import");
  if (!encoded) {
    return;
  }
  url.searchParams.delete("import");
  window.history.replaceState({}, "", url.toString());
  const payload = decodeSharedPalette(encoded);
  if (!payload) {
    appendLog("Shared palette link is invalid.", "error");
    return;
  }
  const name = payload.name?.trim() || "Shared palette";
  const colors = (payload.colors ?? [])
    .filter((color) => typeof color.hex === "string" && color.hex.trim())
    .map((color, index) => {
      const hex = normalizeHex(color.hex.trim());
      const rgb = hexToRgb(hex);
      const fallbackName = color.name?.trim() ||
        nameColor(
          hex.toUpperCase(),
          resolveNameFormat(formatSelect?.value ?? "pantone"),
          index
        );
      return {
        id: createId(),
        name: fallbackName,
        rgb,
      };
    });
  if (colors.length === 0) {
    appendLog("Shared palette has no colors.", "error");
    return;
  }
  const confirmed = window.confirm(`Import shared palette "${name}"?`);
  if (!confirmed) {
    return;
  }
  const palette: Palette = {
    id: createId(),
    name,
    colors,
  };
  state.palettes.unshift(palette);
  syncActivePalette(palette.id);
  appendLog("Imported shared palette.", "success");
};

setupFormatSelects();
setupColorNotationSelects();
setupDropzone();
setupVersionBadge();
setupActions();
hydratePreferences();
hydratePalettes();
importSharedPaletteFromUrl();
renderPaletteList();
renderEditor();
updateExportAvailability();
void waitForAppReady();
