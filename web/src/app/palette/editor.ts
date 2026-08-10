import { closeColorTools, openColorTools } from "../color/tools";
import {
  addColorButton,
  editorExportButton,
  editorLayoutToggle,
  editorModal,
  editorSubtitle,
  editorTools,
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
import { formatColorValue, getContrastColor, rgbToHex } from "../utils/color";
import { createId } from "../utils/id";
import { readStoredText, writeStoredText } from "../utils/storage";
import { resetEditorSession, startEditorSession, updateEditorDirtyState } from "./editor-session";
import { resolveActiveNameFormat } from "./format";
import { insertColorAt, moveColorToIndex, syncActivePalette, updatePalette } from "./mutations";
import { nameColor } from "./naming";
import { renderViewModal } from "./view";

type EditorLayout = "horizontal" | "vertical";

const LAYOUT_STORAGE_KEY = "palette-studio.editor-layout";
const DEFAULT_LAYOUT: EditorLayout = "horizontal";

/**
 * The layout is only ever changed by the toggle. It used to be derived from the window's aspect
 * ratio and re-derived on every resize, which meant the editor silently flipped from rows to
 * columns while the window was being resized.
 */
let editorLayout: EditorLayout = DEFAULT_LAYOUT;

let colorListSortable: ReturnType<typeof createSortable> | null = null;

const readStoredLayout = (): EditorLayout | null => {
  const stored = readStoredText(LAYOUT_STORAGE_KEY);
  return stored === "horizontal" || stored === "vertical" ? stored : null;
};

const persistLayout = (layout: EditorLayout) => {
  writeStoredText(LAYOUT_STORAGE_KEY, layout);
};

const applyEditorLayout = (layout: EditorLayout) => {
  editorLayout = layout;
  if (paletteEditor) {
    paletteEditor.dataset.layout = layout;
  }
  if (editorLayoutToggle) {
    const isVertical = layout === "vertical";
    // The icon shows the layout you are in; the label describes what pressing it does.
    setButtonContent(
      editorLayoutToggle,
      isVertical ? "columns" : "rows",
      t(isVertical ? "editor.layout.switchToHorizontal" : "editor.layout.switchToVertical"),
      true,
    );
    editorLayoutToggle.setAttribute("aria-pressed", isVertical ? "true" : "false");
  }
};

export const syncEditorLayout = () => {
  applyEditorLayout(editorLayout);
};

export const setupEditorLayout = () => {
  applyEditorLayout(readStoredLayout() ?? DEFAULT_LAYOUT);

  editorLayoutToggle?.addEventListener("click", () => {
    const next: EditorLayout = editorLayout === "vertical" ? "horizontal" : "vertical";
    persistLayout(next);
    applyEditorLayout(next);
  });
};

/** The popover is anchored to a row, so it must go when the rows are rebuilt. */
export const dismissColorTools = () => closeColorTools();

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

/** Bind the color-row sortable once against the stable editor root. */
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
 * A "+" that inserts a color at a specific position, revealed by hovering the edge between two
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

  // The hex and the name are spans inside one button, not two buttons side by side: hovering
  // either half offers the same thing, and a single control gives one hover target, one tooltip
  // and one focus stop instead of two.
  const valueLabel = document.createElement("span");
  valueLabel.className = "color-card-value";
  valueLabel.textContent = formatColorValue(color, notation);

  const nameLabel = document.createElement("span");
  nameLabel.className = "color-card-name";
  nameLabel.textContent = color.name;

  const textGroup = document.createElement("button");
  textGroup.type = "button";
  textGroup.className = "color-card-text";
  textGroup.title = t("action.changeColor");
  textGroup.setAttribute("aria-label", t("action.changeColor"));
  textGroup.append(valueLabel, nameLabel);

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

  /** Apply a color to the palette without recording an undo step (used while dragging). */
  const previewColor = (rgb: [number, number, number]) => {
    const target = palette.colors.find((entry) => entry.id === color.id);
    const nextName = nameColor(rgbToHex(rgb).toUpperCase(), nameFormat, getRowIndex(row));
    if (target) {
      target.rgb = rgb;
      target.name = nextName;
    }
    applyRowVisuals(rgb, nextName);
    renderViewModal();
    updateEditorDirtyState(palette);
  };

  const openPicker = (anchor: HTMLElement) => {
    const original = [...color.rgb] as [number, number, number];
    openColorTools({
      // Anchor to the control that was clicked. Anchoring to the row put the popover a full
      // column-height away from the pointer in the column layout.
      anchor,
      rgb: palette.colors.find((entry) => entry.id === color.id)?.rgb ?? original,
      name: nameLabel.textContent ?? color.name,
      onPreview: previewColor,
      onCommit: (rgb) => {
        // Route through `updatePalette` so the change becomes an undo step.
        updatePalette(palette.id, (item) => {
          const target = item.colors.find((entry) => entry.id === color.id);
          if (target) {
            target.rgb = [...rgb] as [number, number, number];
            target.name = nameColor(rgbToHex(rgb).toUpperCase(), nameFormat, index);
          }
        });
      },
      onCancel: () => previewColor(original),
    });
  };

  textGroup.addEventListener("click", () => openPicker(textGroup));

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
  setButtonContent(duplicateButton, "duplicate", t("action.duplicate"), true);
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
  row.append(dragHandle, textGroup, actions, createInsertButton(palette.id, row));
  if (index === palette.colors.length - 1) {
    row.appendChild(createInsertButton(palette.id, row, true));
  }
  applyRowVisuals(color.rgb, color.name);

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
