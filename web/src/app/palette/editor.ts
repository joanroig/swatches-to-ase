import {
  addColorButton,
  editorExportButton,
  editorFooter,
  editorLayoutOptions,
  editorModal,
  editorSubtitle,
  paletteEditor,
  paletteNameInput,
  palettePreview,
} from "../dom";
import { updateExportAvailability } from "../export/manager";
import { t } from "../i18n";
import { getColorNotation } from "../preferences";
import { state } from "../state";
import type { Palette, PaletteColor } from "../types";
import { setButtonContent } from "../ui/icons";
import { setModalOpen } from "../ui/modals";
import { showToast } from "../ui/notifications";
import { createSortable } from "../ui/sortable";
import { formatColorValue, getContrastColor, hexToRgb, rgbToHex } from "../utils/color";
import { createId } from "../utils/id";
import { resetEditorSession, startEditorSession, updateEditorDirtyState } from "./editor-session";
import { resolveActiveNameFormat } from "./format";
import { moveColorToIndex, syncActivePalette, updatePalette } from "./mutations";
import { nameColor } from "./naming";
import { renderViewModal } from "./view";

type EditorLayout = "horizontal" | "vertical";

const editorLayoutState = {
  mode: "auto" as "auto" | "manual",
  value: "horizontal" as EditorLayout,
};

let colorListSortable: ReturnType<typeof createSortable> | null = null;

const getAutoEditorLayout = (): EditorLayout => (window.innerWidth >= window.innerHeight ? "horizontal" : "vertical");

const applyEditorLayout = (layout: EditorLayout) => {
  editorLayoutState.value = layout;
  if (paletteEditor) {
    paletteEditor.dataset.layout = layout;
  }
  editorLayoutOptions.forEach((option) => {
    option.checked = option.value === layout;
  });
};

export const syncEditorLayout = () => {
  applyEditorLayout(editorLayoutState.mode === "auto" ? getAutoEditorLayout() : editorLayoutState.value);
};

export const setupEditorLayout = () => {
  editorLayoutOptions.forEach((option) => {
    option.addEventListener("change", () => {
      if (!option.checked) {
        return;
      }
      editorLayoutState.mode = "manual";
      applyEditorLayout(option.value as EditorLayout);
    });
  });

  const handleResize = () => {
    if (editorLayoutState.mode === "auto") {
      applyEditorLayout(getAutoEditorLayout());
    }
  };

  window.addEventListener("resize", handleResize);
  handleResize();
};

export const openEditorForPalette = (paletteId: string) => {
  syncActivePalette(paletteId);
  const palette = state.palettes.find((item) => item.id === paletteId);
  if (palette) {
    startEditorSession(palette);
  }
  setModalOpen(editorModal, true);
};

const copyColorValue = async (value: string) => {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(value);
    showToast(t("toast.colorCopied"), "success");
  } catch (error) {
    console.error(error);
    showToast(t("toast.colorCopyFailed"), "error");
  }
};

/** Bind the colour-row sortable once against the stable editor root. */
const ensureColorListSortable = () => {
  if (colorListSortable || !paletteEditor) {
    return;
  }
  colorListSortable = createSortable({
    root: paletteEditor,
    itemSelector: ".color-row[data-color-id]",
    handleSelector: ".drag-handle",
    onDrop: (fromIndex, toIndex) => {
      if (!state.activePaletteId) {
        return;
      }
      moveColorToIndex(state.activePaletteId, fromIndex, toIndex);
    },
  });
};

const renderPreview = (palette: Palette, notation: string) => {
  if (!palettePreview) {
    return;
  }
  palettePreview.innerHTML = "";
  if (palette.colors.length === 0) {
    palettePreview.innerHTML = `<p class="empty">${t("editor.preview.emptyColors")}</p>`;
    return;
  }
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
};

/** Live-update the matching preview swatch while a colour input is being dragged. */
const syncPreviewSwatch = (color: PaletteColor, rgb: [number, number, number], name: string, notation: string) => {
  const preview = palettePreview?.querySelector<HTMLDivElement>(`[data-color-id="${color.id}"]`);
  if (!preview) {
    return;
  }
  preview.style.background = rgbToHex(rgb);
  preview.style.color = getContrastColor(rgb);
  const previewHex = preview.querySelector<HTMLElement>(".preview-hex");
  if (previewHex) {
    previewHex.textContent = formatColorValue({ ...color, rgb, name }, notation);
  }
  const previewName = preview.querySelector<HTMLElement>(".preview-name");
  if (previewName) {
    previewName.textContent = name;
  }
  preview.title = `${name} ${rgbToHex(rgb).toUpperCase()}`;
};

const createColorRow = (palette: Palette, color: PaletteColor, index: number, notation: string, nameFormat: string) => {
  const row = document.createElement("div");
  row.className = "color-row";
  row.dataset.colorId = color.id;

  const dragHandle = document.createElement("button");
  dragHandle.type = "button";
  dragHandle.className = "ghost drag-handle";
  dragHandle.draggable = false;
  setButtonContent(dragHandle, "grip", t("action.dragToReorder"), true);

  const valueLabel = document.createElement("button");
  valueLabel.type = "button";
  valueLabel.className = "color-card-value";
  valueLabel.textContent = formatColorValue(color, notation);

  const nameLabel = document.createElement("button");
  nameLabel.type = "button";
  nameLabel.className = "color-card-name";
  nameLabel.textContent = color.name;

  const textGroup = document.createElement("div");
  textGroup.className = "color-card-text";
  textGroup.append(valueLabel, nameLabel);

  const content = document.createElement("div");
  content.className = "color-card-content";
  content.append(dragHandle, textGroup);

  const swatch = document.createElement("input");
  swatch.type = "color";
  swatch.className = "color-swatch-input";
  swatch.value = rgbToHex(color.rgb);
  swatch.setAttribute("aria-label", t("editor.colorPicker"));
  swatch.title = t("editor.colorPicker");
  swatch.tabIndex = -1;

  const applyRowVisuals = (rgb: [number, number, number], name: string) => {
    const hex = rgbToHex(rgb);
    row.style.background = hex;
    const contrast = getContrastColor(rgb);
    row.style.color = contrast;
    row.dataset.contrast = contrast === "#f8fafc" ? "light" : "dark";
    row.title = `${name} ${hex.toUpperCase()}`;
    nameLabel.textContent = name;
    valueLabel.textContent = formatColorValue({ ...color, rgb, name }, notation);
  };

  const openPicker = () => swatch.click();
  valueLabel.addEventListener("click", openPicker);
  nameLabel.addEventListener("click", openPicker);

  const actions = document.createElement("div");
  actions.className = "color-actions";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "ghost";
  setButtonContent(copyButton, "code", t("action.copy"), true);
  copyButton.addEventListener("click", () => {
    void copyColorValue(formatColorValue(color, notation));
  });

  const duplicateButton = document.createElement("button");
  duplicateButton.type = "button";
  duplicateButton.className = "ghost";
  setButtonContent(duplicateButton, "files", t("action.duplicate"), true);
  duplicateButton.addEventListener("click", () => {
    updatePalette(palette.id, (item) => {
      const targetIndex = item.colors.findIndex((entry) => entry.id === color.id);
      if (targetIndex < 0) {
        return;
      }
      const source = item.colors[targetIndex];
      item.colors.splice(targetIndex + 1, 0, {
        id: createId(),
        name: source.name,
        rgb: [...source.rgb] as [number, number, number],
      });
    });
  });

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "ghost";
  setButtonContent(removeButton, "trash", t("action.remove"), true);
  removeButton.addEventListener("click", () => {
    updatePalette(palette.id, (item) => {
      item.colors = item.colors.filter((entry) => entry.id !== color.id);
    });
  });

  actions.append(copyButton, duplicateButton, removeButton);
  row.append(content, actions, swatch);
  applyRowVisuals(color.rgb, color.name);

  // `input` fires continuously while the OS picker is open: paint without re-rendering the list.
  swatch.addEventListener("input", () => {
    const nextRgb = hexToRgb(swatch.value);
    const nextName = nameColor(swatch.value.toUpperCase(), nameFormat, index);
    const target = palette.colors.find((entry) => entry.id === color.id);
    if (target) {
      target.rgb = nextRgb;
      target.name = nextName;
    }
    applyRowVisuals(nextRgb, nextName);
    syncPreviewSwatch(color, nextRgb, nextName, notation);
    renderViewModal();
    updateEditorDirtyState(palette);
  });

  // `change` fires once, when the picker closes: commit through the normal update path.
  swatch.addEventListener("change", () => {
    updatePalette(palette.id, (item) => {
      const target = item.colors.find((entry) => entry.id === color.id);
      if (target) {
        target.rgb = hexToRgb(swatch.value);
        target.name = nameColor(swatch.value.toUpperCase(), nameFormat, index);
      }
    });
  });

  return row;
};

export const renderEditor = () => {
  if (!paletteEditor) {
    return;
  }
  ensureColorListSortable();
  const palette = state.palettes.find((item) => item.id === state.activePaletteId);

  paletteEditor.innerHTML = "";
  if (palettePreview) {
    palettePreview.innerHTML = "";
  }
  editorFooter?.classList.toggle("is-hidden", !palette);
  if (addColorButton) {
    addColorButton.disabled = !palette;
  }
  if (editorExportButton) {
    editorExportButton.disabled = !palette;
  }

  if (!palette) {
    paletteEditor.innerHTML = `<p class="empty">${t("editor.empty")}</p>`;
    if (palettePreview) {
      palettePreview.innerHTML = `<p class="empty">${t("editor.preview.empty")}</p>`;
    }
    if (editorSubtitle) {
      editorSubtitle.textContent = t("editor.subtitle.empty");
    }
    if (paletteNameInput) {
      paletteNameInput.value = "";
      paletteNameInput.disabled = true;
      delete paletteNameInput.dataset.paletteId;
    }
    resetEditorSession();
    return;
  }

  const notation = getColorNotation();
  const nameFormat = resolveActiveNameFormat();
  syncEditorLayout();

  if (editorSubtitle) {
    editorSubtitle.textContent = t("view.subtitle", {
      name: palette.name,
      count: palette.colors.length,
      colors: t("palette.colors", { count: palette.colors.length }),
    });
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

  renderPreview(palette, notation);

  const list = document.createElement("div");
  list.className = "color-list";
  palette.colors.forEach((color, index) => {
    list.appendChild(createColorRow(palette, color, index, notation, nameFormat));
  });
  paletteEditor.appendChild(list);

  updateExportAvailability();
  renderViewModal();
  updateEditorDirtyState(palette);
};
