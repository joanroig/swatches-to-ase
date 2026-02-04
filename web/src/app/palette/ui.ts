import { firebaseClient } from "../cloud/context";
import { unpublishPalette, upsertPublicPalette } from "../cloud/public";
import {
  addColorButton,
  editorCancelButton,
  editorExportButton,
  editorFooter,
  editorLayoutOptions,
  editorModal,
  editorRedoButton,
  editorSaveButton,
  editorSubtitle,
  editorUndoButton,
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
import { setExportMode, updateExportAvailability } from "../export/manager";
import { t } from "../i18n";
import { persistPalettes } from "../persistence";
import { getColorNotation } from "../preferences";
import { cloudState, dragState, state, viewState } from "../state";
import type { Palette } from "../types";
import { setButtonContent } from "../ui/icons";
import { setModalOpen } from "../ui/modals";
import { showToast } from "../ui/notifications";
import { formatColorValue, getColorMetrics, getContrastColor, hexToRgb, rgbToHex } from "../utils/color";
import { createId } from "../utils/id";
import { duplicatePalette } from "./duplicate";
import { nameColor, resolveNameFormat } from "./naming";

type EditorLayout = "horizontal" | "vertical";

const editorLayoutState = {
  mode: "auto" as "auto" | "manual",
  value: "horizontal" as EditorLayout,
};

type PaletteSnapshot = {
  name: string;
  colors: Array<{
    id: string;
    name: string;
    rgb: [number, number, number];
  }>;
};

const editorSession = {
  paletteId: null as string | null,
  original: null as PaletteSnapshot | null,
  history: [] as PaletteSnapshot[],
  future: [] as PaletteSnapshot[],
  isDirty: false,
};

const cloneColors = (colors: Palette["colors"]) =>
  colors.map((color) => ({
    id: color.id,
    name: color.name,
    rgb: [...color.rgb] as [number, number, number],
  }));

const createSnapshot = (palette: Palette): PaletteSnapshot => ({
  name: palette.name,
  colors: cloneColors(palette.colors),
});

const cloneSnapshot = (snapshot: PaletteSnapshot): PaletteSnapshot => ({
  name: snapshot.name,
  colors: cloneColors(snapshot.colors),
});

const snapshotsEqual = (left: PaletteSnapshot, right: PaletteSnapshot) => {
  if (left.name !== right.name || left.colors.length !== right.colors.length) {
    return false;
  }
  return left.colors.every((color, index) => {
    const other = right.colors[index];
    return (
      color.id === other.id &&
      color.name === other.name &&
      color.rgb[0] === other.rgb[0] &&
      color.rgb[1] === other.rgb[1] &&
      color.rgb[2] === other.rgb[2]
    );
  });
};

const applySnapshotToPalette = (palette: Palette, snapshot: PaletteSnapshot) => {
  palette.name = snapshot.name;
  palette.colors = cloneColors(snapshot.colors);
};

const resolveActiveNameFormat = (value?: string) => resolveNameFormat(value ?? formatSelect?.value ?? "pantone");

const getColorName = (rgb: [number, number, number], format: string, index: number) =>
  nameColor(rgbToHex(rgb).toUpperCase(), format, index);

const getAutoEditorLayout = (): EditorLayout => (window.innerWidth >= window.innerHeight ? "horizontal" : "vertical");

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

const applyEditorLayout = (layout: EditorLayout) => {
  editorLayoutState.value = layout;
  if (paletteEditor) {
    paletteEditor.dataset.layout = layout;
  }
  if (editorLayoutOptions.length > 0) {
    editorLayoutOptions.forEach((option) => {
      option.checked = option.value === layout;
    });
  }
};

export const syncEditorLayout = () => {
  if (editorLayoutState.mode === "auto") {
    applyEditorLayout(getAutoEditorLayout());
  } else {
    applyEditorLayout(editorLayoutState.value);
  }
};

export const setupEditorLayout = () => {
  if (editorLayoutOptions.length > 0) {
    editorLayoutOptions.forEach((option) => {
      option.addEventListener("change", () => {
        if (!option.checked) {
          return;
        }
        editorLayoutState.mode = "manual";
        applyEditorLayout(option.value as EditorLayout);
      });
    });
  }

  const handleResize = () => {
    if (editorLayoutState.mode === "auto") {
      applyEditorLayout(getAutoEditorLayout());
    }
  };

  window.addEventListener("resize", handleResize);
  handleResize();
};

export const getPaletteById = (paletteId: string | null) => state.palettes.find((item) => item.id === paletteId);

const isEditorSessionActive = (paletteId?: string | null) =>
  Boolean(editorSession.paletteId) && (paletteId ?? editorSession.paletteId) === editorSession.paletteId;

const getEditorPalette = () => (editorSession.paletteId ? (getPaletteById(editorSession.paletteId) ?? null) : null);

const updateEditorActions = () => {
  const palette = getEditorPalette();
  const hasPalette = Boolean(palette);
  const canUndo = hasPalette && editorSession.history.length > 1;
  const canRedo = hasPalette && editorSession.future.length > 0;
  const canSave = hasPalette && editorSession.isDirty;

  if (editorUndoButton) {
    editorUndoButton.disabled = !canUndo;
  }
  if (editorRedoButton) {
    editorRedoButton.disabled = !canRedo;
  }
  if (editorSaveButton) {
    editorSaveButton.disabled = !canSave;
  }
  if (editorCancelButton) {
    editorCancelButton.disabled = !canSave;
  }
};

const updateEditorDirtyState = (palette: Palette | null) => {
  if (!palette || !editorSession.original) {
    editorSession.isDirty = false;
    updateEditorActions();
    return;
  }
  const snapshot = createSnapshot(palette);
  editorSession.isDirty = !snapshotsEqual(snapshot, editorSession.original);
  updateEditorActions();
};

const recordEditorSnapshot = (palette: Palette) => {
  if (!isEditorSessionActive(palette.id)) {
    return;
  }
  const snapshot = createSnapshot(palette);
  const lastSnapshot = editorSession.history[editorSession.history.length - 1];
  if (!lastSnapshot || !snapshotsEqual(lastSnapshot, snapshot)) {
    editorSession.history.push(snapshot);
    editorSession.future = [];
  }
  updateEditorDirtyState(palette);
};

const resetEditorSession = () => {
  editorSession.paletteId = null;
  editorSession.original = null;
  editorSession.history = [];
  editorSession.future = [];
  editorSession.isDirty = false;
  updateEditorActions();
};

const startEditorSession = (palette: Palette) => {
  editorSession.paletteId = palette.id;
  const snapshot = createSnapshot(palette);
  editorSession.original = cloneSnapshot(snapshot);
  editorSession.history = [cloneSnapshot(snapshot)];
  editorSession.future = [];
  editorSession.isDirty = false;
  updateEditorActions();
};

const refreshEditorViews = () => {
  renderPaletteList();
  renderEditor();
  updateExportAvailability();
  renderViewModal();
};

export const undoEditorChange = () => {
  const palette = getEditorPalette();
  if (!palette || editorSession.history.length < 2) {
    return;
  }
  const current = editorSession.history.pop();
  if (current) {
    editorSession.future.push(cloneSnapshot(current));
  }
  const previous = editorSession.history[editorSession.history.length - 1];
  if (!previous) {
    return;
  }
  applySnapshotToPalette(palette, previous);
  refreshEditorViews();
  updateEditorDirtyState(palette);
};

export const redoEditorChange = () => {
  const palette = getEditorPalette();
  const next = editorSession.future.pop();
  if (!palette || !next) {
    return;
  }
  applySnapshotToPalette(palette, next);
  editorSession.history.push(cloneSnapshot(next));
  refreshEditorViews();
  updateEditorDirtyState(palette);
};

export const saveEditorChanges = async () => {
  const palette = getEditorPalette();
  if (!palette) {
    return;
  }
  if (palette.isPublic && editorSession.isDirty) {
    const confirmed = window.confirm(t("palette.editUnpublishConfirm"));
    if (!confirmed) {
      return;
    }
    try {
      await unpublishPalette(palette, { persist: false });
      showToast(t("toast.paletteUnpublished"), "success");
      renderPaletteList();
      renderViewModal();
    } catch (error) {
      console.error(error);
      showToast(t("toast.paletteUnpublishFailed"), "error");
    }
  }
  const snapshot = createSnapshot(palette);
  editorSession.original = cloneSnapshot(snapshot);
  editorSession.history = [cloneSnapshot(snapshot)];
  editorSession.future = [];
  editorSession.isDirty = false;
  updateEditorActions();
  persistPalettes();
};

export const cancelEditorChanges = () => {
  const palette = getEditorPalette();
  if (!palette || !editorSession.original) {
    return;
  }
  applySnapshotToPalette(palette, editorSession.original);
  refreshEditorViews();
  const snapshot = createSnapshot(palette);
  editorSession.history = [snapshot];
  editorSession.future = [];
  editorSession.isDirty = false;
  updateEditorActions();
};

export const confirmEditorClose = () => {
  if (!editorSession.isDirty) {
    resetEditorSession();
    return true;
  }
  const confirmed = window.confirm(t("editor.unsavedConfirm"));
  if (!confirmed) {
    return false;
  }
  const palette = getEditorPalette();
  if (palette && editorSession.original) {
    applySnapshotToPalette(palette, editorSession.original);
    refreshEditorViews();
  }
  resetEditorSession();
  return true;
};

export const syncActivePalette = (paletteId: string | null) => {
  state.activePaletteId = paletteId;
  renderPaletteList();
  renderEditor();
  updateExportAvailability();
  persistPalettes();
};

export const openEditorForPalette = (paletteId: string) => {
  syncActivePalette(paletteId);
  const palette = getPaletteById(paletteId);
  if (palette) {
    startEditorSession(palette);
  }
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
    viewSubtitle.textContent = t("view.emptySubtitle");
    viewValues.textContent = t("view.empty");
    return;
  }

  viewSubtitle.textContent = t("view.subtitle", {
    name: palette.name,
    count: palette.colors.length,
    colors: t("palette.colors", { count: palette.colors.length }),
  });

  if (palette.colors.length === 0) {
    viewState.colorId = null;
    viewDisplay.classList.add("is-empty");
    viewDisplay.style.background = "";
    viewDisplay.style.color = "";
    viewValues.textContent = t("view.emptyColors");
    return;
  }

  const activeColor = palette.colors.find((color) => color.id === viewState.colorId) ?? palette.colors[0];
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
    { label: t("notation.hex"), value: hex.replace("#", "") },
    { label: t("notation.hsb"), value: `${Math.round(hsbH)}, ${Math.round(hsbS)}, ${Math.round(hsbV)}` },
    { label: t("notation.hsl"), value: `${Math.round(hslH)}, ${Math.round(hslS)}, ${Math.round(hslL)}` },
    { label: t("notation.rgb"), value: `${r}, ${g}, ${b}` },
    { label: t("notation.cmyk"), value: `${Math.round(c)}, ${Math.round(m)}, ${Math.round(y)}, ${Math.round(k)}` },
    { label: t("notation.lab"), value: `${Math.round(labL)}, ${Math.round(labA)}, ${Math.round(labB)}` },
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
    paletteList.innerHTML = `<p class="empty">${t("palette.empty")}</p>`;
    updateExportAvailability();
    return;
  }

  for (const palette of state.palettes) {
    const card = document.createElement("article");
    card.className = palette.id === state.activePaletteId ? "palette-card is-active" : "palette-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.addEventListener("click", () => openViewForPalette(palette.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openViewForPalette(palette.id);
      }
    });

    const header = document.createElement("div");
    header.className = "palette-card-header";

    const meta = document.createElement("div");
    meta.className = "palette-meta";

    const title = document.createElement("div");
    title.className = "palette-title";
    title.textContent = palette.name;

    const metaRow = document.createElement("div");
    metaRow.className = "palette-meta-row";
    metaRow.append(title);
    const count = document.createElement("span");
    count.className = "palette-count";
    count.textContent = t("palette.colors", { count: palette.colors.length });
    metaRow.appendChild(count);
    if (palette.isPublic) {
      const badge = document.createElement("span");
      badge.className = "palette-badge";
      badge.textContent = t("palette.public");
      metaRow.appendChild(badge);
    }

    meta.append(metaRow);

    const actions = document.createElement("div");
    actions.className = "palette-actions";
    const editButton = document.createElement("button");
    editButton.className = "ghost";
    const editLabel = t("action.edit");
    setButtonContent(editButton, "edit", editLabel);
    editButton.setAttribute("aria-label", editLabel);
    editButton.title = editLabel;
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openEditorForPalette(palette.id);
    });

    const exportButton = document.createElement("button");
    exportButton.className = "ghost";
    const exportLabel = t("action.export");
    setButtonContent(exportButton, "export", exportLabel);
    exportButton.setAttribute("aria-label", exportLabel);
    exportButton.title = exportLabel;
    exportButton.addEventListener("click", (event) => {
      event.stopPropagation();
      syncActivePalette(palette.id);
      setExportMode("single");
      setModalOpen(exportModal, true);
    });

    const duplicateButton = document.createElement("button");
    duplicateButton.className = "ghost";
    const duplicateLabel = t("action.duplicate");
    setButtonContent(duplicateButton, "files", duplicateLabel);
    duplicateButton.setAttribute("aria-label", duplicateLabel);
    duplicateButton.title = duplicateLabel;
    duplicateButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const copy = duplicatePalette(
        palette,
        state.palettes.map((item) => item.name),
      );
      state.palettes.unshift(copy);
      syncActivePalette(copy.id);
    });

    const actionSpacer = document.createElement("span");
    actionSpacer.className = "palette-actions-spacer";

    const publishButton = document.createElement("button");
    publishButton.className = "ghost";
    const publishLabel = palette.isPublic ? t("action.unpublish") : t("action.publish");
    setButtonContent(publishButton, "globe", publishLabel);
    publishButton.setAttribute("aria-label", publishLabel);
    publishButton.title = cloudState.user ? publishLabel : t("palette.signInToPublish");
    publishButton.disabled = !cloudState.isConfigured || !cloudState.user;
    publishButton.addEventListener("click", (event) => {
      event.stopPropagation();
      void togglePaletteVisibility(palette.id);
    });

    const removeButton = document.createElement("button");
    removeButton.className = "ghost";
    const removeLabel = t("action.remove");
    setButtonContent(removeButton, "trash", removeLabel);
    removeButton.setAttribute("aria-label", removeLabel);
    removeButton.title = removeLabel;
    removeButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const confirmed = window.confirm(t("palette.removeConfirm", { name: palette.name }));
      if (!confirmed) {
        return;
      }
      if (palette.isPublic) {
        try {
          await unpublishPalette(palette, { persist: false });
          showToast(t("toast.paletteUnpublished"), "success");
        } catch (error) {
          console.error(error);
          showToast(t("toast.paletteUnpublishFailed"), "error");
        }
      }
      state.palettes = state.palettes.filter((item) => item.id !== palette.id);
      syncActivePalette(state.palettes[0]?.id ?? null);
    });

    actions.append(editButton, duplicateButton, exportButton, actionSpacer, publishButton, removeButton);

    header.append(meta);

    const chips = document.createElement("div");
    chips.className = "palette-chips";
    if (palette.colors.length === 0) {
      chips.classList.add("is-empty");
      const empty = document.createElement("span");
      empty.className = "empty";
      empty.textContent = t("palette.noColors");
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
        more.title = t("palette.moreColors", { count: remaining });
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
    showToast(t("palette.signInToPublishToast"), "info");
    return;
  }
  if (palette.isPublic) {
    try {
      await unpublishPalette(palette);
      showToast(t("toast.paletteUnpublished"), "success");
    } catch (error) {
      console.error(error);
      showToast(t("toast.paletteUnpublishFailed"), "error");
    }
  } else {
    palette.isPublic = true;
    persistPalettes();
    cloudState.recentPublicUpserts.set(palette.id, Date.now());
    try {
      await upsertPublicPalette(palette);
      cloudState.recentPublicUpserts.set(palette.id, Date.now());
      showToast(t("toast.palettePublished"), "success");
    } catch (error) {
      console.error(error);
      showToast(t("toast.palettePublishFailed"), "error");
    }
  }
  renderPaletteList();
};

export const updatePalette = (paletteId: string, updater: (palette: Palette) => void) => {
  const palette = state.palettes.find((item) => item.id === paletteId);
  if (!palette) {
    return;
  }
  updater(palette);
  palette.lastModified = Date.now();
  renderPaletteList();
  renderEditor();
  updateExportAvailability();
  if (isEditorSessionActive(paletteId)) {
    recordEditorSnapshot(palette);
  } else {
    persistPalettes();
  }
};

export const updatePaletteName = (paletteId: string, nextName: string) => {
  const palette = state.palettes.find((item) => item.id === paletteId);
  if (!palette) {
    return;
  }
  palette.name = nextName;
  palette.lastModified = Date.now();
  renderPaletteList();
  if (editorSubtitle) {
    editorSubtitle.textContent = t("view.subtitle", {
      name: palette.name,
      count: palette.colors.length,
      colors: t("palette.colors", { count: palette.colors.length }),
    });
  }
  renderViewModal();
  if (isEditorSessionActive(paletteId)) {
    recordEditorSnapshot(palette);
  } else {
    persistPalettes();
  }
};

export const syncPaletteColorNames = (formatOverride?: string) => {
  const nameFormat = resolveActiveNameFormat(formatOverride);
  state.palettes.forEach((palette) => {
    palette.colors.forEach((color, index) => {
      color.name = getColorName(color.rgb, nameFormat, index);
    });
  });
  renderPaletteList();
  renderEditor();
  updateExportAvailability();
  renderViewModal();
  const activePalette = getEditorPalette();
  if (activePalette) {
    recordEditorSnapshot(activePalette);
  }
  if (!editorSession.isDirty) {
    persistPalettes();
  }
};

const moveColorToIndex = (paletteId: string, colorId: string, targetIndex: number) => {
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
    const insertIndex = fromIndex < boundedIndex ? boundedIndex - 1 : boundedIndex;
    item.colors.splice(insertIndex, 0, moved);
  });
};

export const renderEditor = () => {
  if (!paletteEditor) {
    return;
  }
  const palette = state.palettes.find((item) => item.id === state.activePaletteId);

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

  if (palettePreview) {
    if (palette.colors.length === 0) {
      palettePreview.innerHTML = `<p class="empty">${t("editor.preview.emptyColors")}</p>`;
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
  dropTarget.textContent = t("editor.dropTarget");

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

  palette.colors.forEach((color, index) => {
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
      const fromId = dragState.colorId ?? event.dataTransfer?.getData("text/plain");
      if (!paletteId || !fromId || fromId === color.id) {
        resetDragClasses();
        return;
      }
      const targetIndex = palette.colors.findIndex((entry) => entry.id === color.id);
      if (targetIndex >= 0) {
        moveColorToIndex(paletteId, fromId, targetIndex);
      }
      resetDragClasses();
    });

    const content = document.createElement("div");
    content.className = "color-card-content";

    const valueLabel = document.createElement("button");
    valueLabel.type = "button";
    valueLabel.className = "color-card-value";
    valueLabel.textContent = formatColorValue(color, notation);

    const nameLabel = document.createElement("button");
    nameLabel.type = "button";
    nameLabel.className = "color-card-name";
    nameLabel.textContent = color.name;
    const applyRowVisuals = (nextRgb: [number, number, number], nextName: string) => {
      const nextHex = rgbToHex(nextRgb);
      row.style.background = nextHex;
      const contrast = getContrastColor(nextRgb);
      row.style.color = contrast;
      row.dataset.contrast = contrast === "#f8fafc" ? "light" : "dark";
      row.title = `${nextName} ${nextHex.toUpperCase()}`;
      nameLabel.textContent = nextName;
      valueLabel.textContent = formatColorValue({ ...color, rgb: nextRgb, name: nextName }, notation);
    };

    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "ghost drag-handle";
    dragHandle.draggable = true;
    setButtonContent(dragHandle, "grip", t("editor.drag"), true);
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

    const textGroup = document.createElement("div");
    textGroup.className = "color-card-text";
    textGroup.append(valueLabel, nameLabel);

    content.append(dragHandle, textGroup);

    const actions = document.createElement("div");
    actions.className = "color-actions";

    const swatch = document.createElement("input");
    swatch.type = "color";
    swatch.className = "color-swatch-input";
    swatch.value = rgbToHex(color.rgb);
    swatch.setAttribute("aria-label", t("editor.colorPicker"));
    swatch.title = t("editor.colorPicker");
    swatch.tabIndex = -1;

    const openPicker = () => {
      swatch.click();
    };

    valueLabel.addEventListener("click", openPicker);
    nameLabel.addEventListener("click", openPicker);

    const handleDuplicate = () => {
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
    };

    const handleRemove = () => {
      updatePalette(palette.id, (item) => {
        item.colors = item.colors.filter((entry) => entry.id !== color.id);
      });
    };

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
    duplicateButton.addEventListener("click", handleDuplicate);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "ghost";
    setButtonContent(removeButton, "trash", t("action.remove"), true);
    removeButton.addEventListener("click", handleRemove);

    actions.append(copyButton, duplicateButton, removeButton);
    row.append(content, actions, swatch);

    applyRowVisuals(color.rgb, color.name);

    swatch.addEventListener("input", () => {
      const nextRgb = hexToRgb(swatch.value);
      const nextName = nameColor(swatch.value.toUpperCase(), nameFormat, index);
      const target = palette.colors.find((entry) => entry.id === color.id);
      if (target) {
        target.rgb = nextRgb;
        target.name = nextName;
      }
      applyRowVisuals(nextRgb, nextName);
      const preview = palettePreview?.querySelector<HTMLDivElement>(`[data-color-id="${color.id}"]`);
      if (preview) {
        preview.style.background = swatch.value;
        preview.style.color = getContrastColor(nextRgb);
        const previewHex = preview.querySelector<HTMLElement>(".preview-hex");
        if (previewHex) {
          previewHex.textContent = formatColorValue({ ...color, rgb: nextRgb, name: nextName }, notation);
        }
        const previewName = preview.querySelector<HTMLElement>(".preview-name");
        if (previewName) {
          previewName.textContent = nextName;
        }
        preview.title = `${nextName} ${rgbToHex(nextRgb).toUpperCase()}`;
      }
      renderViewModal();
      if (isEditorSessionActive(palette.id)) {
        updateEditorDirtyState(palette);
      }
    });
    swatch.addEventListener("change", () => {
      updatePalette(palette.id, (item) => {
        const target = item.colors.find((entry) => entry.id === color.id);
        if (target) {
          target.rgb = hexToRgb(swatch.value);
          target.name = nameColor(swatch.value.toUpperCase(), nameFormat, index);
        }
      });
    });
    list.appendChild(row);
  });

  list.appendChild(dropTarget);
  paletteEditor.appendChild(list);
  updateExportAvailability();
  renderViewModal();
  updateEditorDirtyState(palette);
};
