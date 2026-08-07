import { unpublishPalette } from "../cloud/public";
import { editorRedoButton, editorSaveButton, editorUndoButton } from "../dom";
import { updateExportAvailability } from "../export/manager";
import { t } from "../i18n";
import { persistPalettes } from "../persistence";
import { state } from "../state";
import type { Palette } from "../types";
import { showToast } from "../ui/notifications";
import { renderEditor } from "./editor";
import { renderPaletteList } from "./list";
import { renderViewModal } from "./view";

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

export const isEditorSessionActive = (paletteId?: string | null) =>
  Boolean(editorSession.paletteId) && (paletteId ?? editorSession.paletteId) === editorSession.paletteId;

export const isEditorDirty = () => editorSession.isDirty;

export const getEditorPalette = () =>
  editorSession.paletteId ? (state.palettes.find((item) => item.id === editorSession.paletteId) ?? null) : null;

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
};

export const updateEditorDirtyState = (palette: Palette | null) => {
  if (!palette || !editorSession.original) {
    editorSession.isDirty = false;
    updateEditorActions();
    return;
  }
  editorSession.isDirty = !snapshotsEqual(createSnapshot(palette), editorSession.original);
  updateEditorActions();
};

export const recordEditorSnapshot = (palette: Palette) => {
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

export const resetEditorSession = () => {
  editorSession.paletteId = null;
  editorSession.original = null;
  editorSession.history = [];
  editorSession.future = [];
  editorSession.isDirty = false;
  updateEditorActions();
};

export const startEditorSession = (palette: Palette) => {
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
