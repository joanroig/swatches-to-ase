import {
  addColorButton,
  editorExportButton,
  editorTools,
  editorLayoutOptions,
  editorModal,
  editorSubtitle,
  paletteEditor,
  paletteNameInput,
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
import { insertColorAt, moveColorToIndex, syncActivePalette, updatePalette } from "./mutations";
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
    onDrop: ({ fromIndex, toIndex }) => {
      if (!state.activePaletteId) {
        return;
      }
      moveColorToIndex(state.activePaletteId, fromIndex, toIndex, { rerenderEditor: false });
    },
  });
};

/** The row's live position, so handlers stay correct after a drag reorders the DOM in place. */
const getRowIndex = (row: HTMLElement) => {
  const parent = row.parentElement;
  if (!parent) {
    return 0;
  }
  return Array.from(parent.children)
    .filter((child) => child instanceof HTMLElement && child.matches(".color-row[data-color-id]"))
    .indexOf(row);
};

/**
 * A "+" that inserts a colour at a specific position, revealed by hovering the edge between two
 * swatches. It lives inside a row rather than as its own grid item, because an extra grid item
 * would add a track and resize every swatch.
 */
const createInsertButton = (paletteId: string, row: HTMLElement, atEnd = false) => {
  // A small hot zone straddling the boundary, so the "+" only shows when the pointer is near the
  // edge between two swatches rather than anywhere over a swatch.
  const zone = document.createElement("span");
  zone.className = atEnd ? "color-insert-zone color-insert-zone--end" : "color-insert-zone";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "color-insert";
  setButtonContent(button, "plus", t("action.insertColor"), true);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    insertColorAt(paletteId, atEnd ? getRowIndex(row) + 1 : getRowIndex(row));
  });

  zone.appendChild(button);
  return zone;
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
  // Flat children so each layout can order them independently: the row places the handle first and
  // the actions last, the column pins the handle to the top, the label to the bottom and floats the
  // actions in the middle.
  row.append(dragHandle, textGroup, actions, swatch, createInsertButton(palette.id, row));
  if (index === palette.colors.length - 1) {
    row.appendChild(createInsertButton(palette.id, row, true));
  }
  applyRowVisuals(color.rgb, color.name);

  // `input` fires continuously while the OS picker is open: paint without re-rendering the list.
  swatch.addEventListener("input", () => {
    const nextRgb = hexToRgb(swatch.value);
    const nextName = nameColor(swatch.value.toUpperCase(), nameFormat, getRowIndex(row));
    const target = palette.colors.find((entry) => entry.id === color.id);
    if (target) {
      target.rgb = nextRgb;
      target.name = nextName;
    }
    applyRowVisuals(nextRgb, nextName);
    renderViewModal();
    updateEditorDirtyState(palette);
  });

  // `change` fires once, when the picker closes: commit through the normal update path.
  swatch.addEventListener("change", () => {
    updatePalette(palette.id, (item) => {
      const target = item.colors.find((entry) => entry.id === color.id);
      if (target) {
        target.rgb = hexToRgb(swatch.value);
        target.name = nameColor(swatch.value.toUpperCase(), nameFormat, getRowIndex(row));
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
  editorTools?.classList.toggle("is-hidden", !palette);
  // With no swatches there are no inline "+" affordances, so the toolbar button has to be the way
  // in — on every device, not just touch.
  editorTools?.classList.toggle("is-empty-palette", !palette || palette.colors.length === 0);
  if (addColorButton) {
    addColorButton.disabled = !palette;
  }
  if (editorExportButton) {
    editorExportButton.disabled = !palette;
  }

  if (!palette) {
    paletteEditor.innerHTML = `<p class="empty">${t("editor.empty")}</p>`;
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
    // The name is already the editable title right above, so only the count belongs here.
    editorSubtitle.textContent = t("palette.colors", { count: palette.colors.length });
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
