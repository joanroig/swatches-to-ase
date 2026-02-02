import {
  addColorButton,
  autoRenameToggle,
  editorExportButton,
  editorFooter,
  editorModal,
  editorSubtitle,
  exportModal,
  formatSelect,
  paletteEditor,
  paletteList,
  paletteNameInput,
  palettePreview,
  viewDisplay,
  viewModal,
  viewStrip,
  viewSubtitle,
  viewValues,
} from "../dom";
import { cloudState, dragState, state, viewState } from "../state";
import type { Palette } from "../types";
import { createId } from "../utils/id";
import {
  formatColorValue,
  getColorMetrics,
  getContrastColor,
  hexToRgb,
  rgbToHex,
} from "../utils/color";
import { nameColor, resolveNameFormat } from "./naming";
import { setButtonContent } from "../ui/icons";
import { showToast } from "../ui/notifications";
import { setModalOpen } from "../ui/modals";
import { getColorNotation } from "../preferences";
import { persistPalettes } from "../persistence";
import { removePublicPalette, upsertPublicPalette } from "../cloud/public";
import { firebaseClient } from "../cloud/context";
import { setExportMode, updateExportAvailability } from "../export/manager";

export const getPaletteById = (paletteId: string | null) =>
  state.palettes.find((item) => item.id === paletteId);

export const syncActivePalette = (paletteId: string | null) => {
  state.activePaletteId = paletteId;
  renderPaletteList();
  renderEditor();
  updateExportAvailability();
  persistPalettes();
};

export const openEditorForPalette = (paletteId: string) => {
  syncActivePalette(paletteId);
  setModalOpen(editorModal, true);
};

export const openViewForPalette = (paletteId: string) => {
  syncActivePalette(paletteId);
  viewState.paletteId = paletteId;
  viewState.colorId = null;
  renderViewModal();
  setModalOpen(viewModal, true);
};

export const renderViewModal = () => {
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

export const renderPaletteList = () => {
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
    meta.className = "palette-meta";

    const title = document.createElement("div");
    title.className = "palette-title";
    title.textContent = palette.name;

    const count = document.createElement("span");
    count.className = "palette-count";
    count.textContent = `${palette.colors.length} colors`;

    const metaRow = document.createElement("div");
    metaRow.className = "palette-meta-row";
    metaRow.append(title);
    if (palette.isPublic) {
      const badge = document.createElement("span");
      badge.className = "palette-badge";
      badge.textContent = "Public";
      metaRow.appendChild(badge);
    }

    meta.append(metaRow, count);

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

    const publishButton = document.createElement("button");
    publishButton.className = "ghost";
    setButtonContent(
      publishButton,
      "globe",
      palette.isPublic ? "Unpublish" : "Publish"
    );
    publishButton.setAttribute(
      "aria-label",
      palette.isPublic ? "Unpublish" : "Publish"
    );
    publishButton.title = cloudState.user
      ? palette.isPublic
        ? "Unpublish"
        : "Publish"
      : "Sign in to publish";
    publishButton.disabled = !cloudState.isConfigured || !cloudState.user;
    publishButton.addEventListener("click", (event) => {
      event.stopPropagation();
      void togglePaletteVisibility(palette.id);
    });

    const removeButton = document.createElement("button");
    removeButton.className = "ghost";
    setButtonContent(removeButton, "trash", "Remove");
    removeButton.setAttribute("aria-label", "Remove");
    removeButton.title = "Remove";
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const confirmed = window.confirm(
        `Remove "${palette.name}"? This cannot be undone.`
      );
      if (!confirmed) {
        return;
      }
      state.palettes = state.palettes.filter((item) => item.id !== palette.id);
      syncActivePalette(state.palettes[0]?.id ?? null);
    });

    actions.append(viewButton, editButton, exportButton, publishButton, removeButton);

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

const togglePaletteVisibility = async (paletteId: string) => {
  const palette = state.palettes.find((item) => item.id === paletteId);
  if (!palette) {
    return;
  }
  if (!firebaseClient || !cloudState.user) {
    showToast("Sign in to publish palettes.", "info");
    return;
  }
  if (palette.isPublic) {
    palette.isPublic = false;
    persistPalettes();
    try {
      await removePublicPalette(palette);
      showToast("Palette removed from discovery.", "success");
    } catch (error) {
      console.error(error);
      showToast("Failed to unpublish palette.", "error");
    }
  } else {
    palette.isPublic = true;
    palette.publicId = palette.publicId ?? createId();
    persistPalettes();
    try {
      await upsertPublicPalette(palette);
      showToast("Palette published to discovery.", "success");
    } catch (error) {
      console.error(error);
      showToast("Failed to publish palette.", "error");
    }
  }
  renderPaletteList();
};

export const updatePalette = (
  paletteId: string,
  updater: (palette: Palette) => void
) => {
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

export const updatePaletteName = (paletteId: string, nextName: string) => {
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

export const updateColorName = (
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

export const renderEditor = () => {
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
