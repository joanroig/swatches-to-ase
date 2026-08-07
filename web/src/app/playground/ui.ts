import { trackEvent } from "../cloud/analytics";
import { openColorTools } from "../color/tools";
import {
  playgroundAddButton,
  playgroundCountLabel,
  playgroundDetachButton,
  playgroundRamp,
  playgroundRedoButton,
  playgroundRemoveButton,
  playgroundSaveButton,
  playgroundSceneTabs,
  playgroundShuffleButton,
  playgroundSource,
  playgroundSourceText,
  playgroundStage,
  playgroundStyleSelect,
  playgroundUndoButton,
} from "../dom";
import { t } from "../i18n";
import { syncActivePalette } from "../palette/mutations";
import { state } from "../state";
import type { Palette } from "../types";
import { createIcon, setButtonContent } from "../ui/icons";
import { appendLog, showToast } from "../ui/notifications";
import { createSortable, isSortableClickSuppressed } from "../ui/sortable";
import { getContrastColor, rgbToHex } from "../utils/color";
import { createId } from "../utils/id";
import { SCENE_IDS, buildScene, isSceneId, type SceneId } from "./scenes";
import {
  addPlaygroundSwatch,
  canRedoPlayground,
  canUndoPlayground,
  detachPlaygroundSource,
  loadPaletteIntoPlayground,
  movePlaygroundSwatch,
  persistPlayground,
  playgroundLimits,
  playgroundState,
  redoPlayground,
  removePlaygroundSwatch,
  restorePlayground,
  setPlaygroundColor,
  setPlaygroundScene,
  setPlaygroundStyle,
  shufflePlayground,
  togglePlaygroundLock,
  undoPlayground,
} from "./state";

let sortable: ReturnType<typeof createSortable> | null = null;
let isActive = false;

/**
 * Switching to the playground view lives in the shell, which already imports this module. Rather
 * than import it back and create a cycle, the shell hands the switcher over at setup.
 */
let showPlaygroundView: (() => void) | null = null;

export const setPlaygroundViewSwitcher = (switcher: () => void) => {
  showPlaygroundView = switcher;
};

const currentHexes = () => playgroundState.swatches.map((swatch) => rgbToHex(swatch.rgb).toUpperCase());

const createSwatchButton = (icon: Parameters<typeof createIcon>[0], label: string, onClick: () => void) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost icon-only playground-swatch-action";
  setButtonContent(button, icon, label, true);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
};

const renderRamp = () => {
  if (!playgroundRamp) {
    return;
  }
  playgroundRamp.innerHTML = "";
  playgroundState.swatches.forEach((swatch) => {
    const hex = rgbToHex(swatch.rgb).toUpperCase();
    const ink = getContrastColor(swatch.rgb);

    const column = document.createElement("div");
    column.className = "playground-swatch";
    column.dataset.swatchId = swatch.id;
    column.style.background = hex;
    column.style.color = ink;
    column.classList.toggle("is-locked", swatch.locked);

    const actions = document.createElement("div");
    actions.className = "playground-swatch-actions";

    // Grip only, matching the library and the editor: the swatch face is a click target for the
    // colour tools, so dragging from anywhere on it would make the two intents ambiguous.
    const grip = document.createElement("span");
    grip.className = "playground-swatch-grip";
    grip.setAttribute("role", "button");
    grip.setAttribute("aria-label", t("action.dragToReorder"));
    grip.title = t("action.dragToReorder");
    grip.appendChild(createIcon("grip"));

    const lock = createSwatchButton(swatch.locked ? "lock" : "unlock", t(swatch.locked ? "playground.unlock" : "playground.lock"), () => {
      togglePlaygroundLock(swatch.id);
      renderRamp();
    });
    lock.classList.toggle("is-on", swatch.locked);

    const remove = createSwatchButton("trash", t("playground.removeColor"), () => {
      if (!removePlaygroundSwatch(swatch.id)) {
        showToast(t("playground.minColors", { count: playgroundLimits.min }), "info");
        return;
      }
      render();
    });
    remove.disabled = playgroundState.swatches.length <= playgroundLimits.min;

    actions.append(grip, lock, remove);

    const label = document.createElement("button");
    label.type = "button";
    label.className = "playground-swatch-label";
    label.style.color = ink;
    label.title = t("playground.editColor");
    const hexLine = document.createElement("span");
    hexLine.className = "playground-swatch-hex";
    hexLine.textContent = hex.replace("#", "");
    const nameLine = document.createElement("span");
    nameLine.className = "playground-swatch-name";
    nameLine.textContent = swatch.name;
    label.append(hexLine, nameLine);
    label.addEventListener("click", () => {
      if (isSortableClickSuppressed()) {
        return;
      }
      const original = [...swatch.rgb] as [number, number, number];
      openColorTools({
        anchor: label,
        rgb: original,
        name: swatch.name,
        onPreview: (rgb) => {
          column.style.background = rgbToHex(rgb).toUpperCase();
          column.style.color = getContrastColor(rgb);
        },
        onCommit: (rgb) => {
          setPlaygroundColor(swatch.id, rgb);
          render();
        },
        onCancel: () => {
          column.style.background = rgbToHex(original).toUpperCase();
          column.style.color = getContrastColor(original);
        },
      });
    });

    column.append(actions, label);
    playgroundRamp.appendChild(column);
  });

  if (playgroundCountLabel) {
    playgroundCountLabel.textContent = String(playgroundState.swatches.length);
  }
  if (playgroundAddButton) {
    playgroundAddButton.disabled = playgroundState.swatches.length >= playgroundLimits.max;
  }
  if (playgroundRemoveButton) {
    playgroundRemoveButton.disabled = playgroundState.swatches.length <= playgroundLimits.min;
  }
};

const renderSceneTabs = () => {
  if (!playgroundSceneTabs) {
    return;
  }
  playgroundSceneTabs.innerHTML = "";
  SCENE_IDS.forEach((scene) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "playground-scene-tab";
    button.dataset.scene = scene;
    button.setAttribute("role", "tab");
    button.textContent = t(`playground.scene.${scene}`);
    const selected = playgroundState.scene === scene;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.addEventListener("click", () => {
      setPlaygroundScene(scene);
      renderSceneTabs();
      renderStage();
      trackEvent("playground_scene_changed", { scene });
    });
    playgroundSceneTabs.appendChild(button);
  });
};

const renderStage = () => {
  if (!playgroundStage) {
    return;
  }
  const scene: SceneId = isSceneId(playgroundState.scene) ? playgroundState.scene : "blend";
  playgroundStage.innerHTML = "";
  playgroundStage.appendChild(buildScene(scene, currentHexes()));
};

const renderChrome = () => {
  const linked = Boolean(playgroundState.sourcePaletteId);
  playgroundSource?.classList.toggle("is-hidden", !linked);
  if (playgroundSourceText && linked) {
    playgroundSourceText.textContent = t("playground.editing", { name: playgroundState.sourceName ?? "" });
  }
  if (playgroundSaveButton) {
    setButtonContent(playgroundSaveButton, "bookmark", t(linked ? "playground.update" : "playground.save"));
  }
  if (playgroundUndoButton) {
    playgroundUndoButton.disabled = !canUndoPlayground();
  }
  if (playgroundRedoButton) {
    playgroundRedoButton.disabled = !canRedoPlayground();
  }
};

const render = () => {
  renderRamp();
  renderStage();
  renderChrome();
};

/** The three chrome buttons whose icon + label are rebuilt on every language change. */
const syncPlaygroundLabels = () => {
  setButtonContent(playgroundShuffleButton, "refresh", t("playground.shuffle"));
  // Appended after `setButtonContent`, which clears the button. Inside the button rather than
  // beside it: as a sibling the key cap was a sixth control shape sitting loose on the bar.
  if (playgroundShuffleButton) {
    const key = document.createElement("kbd");
    key.className = "playground-kbd";
    key.textContent = t("playground.shuffleKey");
    key.setAttribute("aria-hidden", "true");
    playgroundShuffleButton.appendChild(key);
    playgroundShuffleButton.setAttribute("aria-keyshortcuts", "Space");
  }
  setButtonContent(playgroundAddButton, "plus", t("playground.addColor"), true);
  setButtonContent(playgroundRemoveButton, "minus", t("playground.removeLast"), true);
  setButtonContent(playgroundSaveButton, "bookmark", t("playground.save"));
  setButtonContent(playgroundUndoButton, "undo", t("action.undo"), true);
  setButtonContent(playgroundRedoButton, "redo", t("action.redo"), true);
};

const ensureSortable = () => {
  if (!playgroundRamp || sortable) {
    return;
  }
  sortable = createSortable({
    root: playgroundRamp,
    itemSelector: ".playground-swatch[data-swatch-id]",
    handleSelector: ".playground-swatch-grip",
    onDrop: ({ fromIndex, toIndex }) => {
      movePlaygroundSwatch(fromIndex, toIndex);
      // The swatches are already in place; only the scene reads the new order.
      renderStage();
    },
  });
};

const currentColors = () =>
  playgroundState.swatches.map((swatch) => ({
    id: createId(),
    name: swatch.name,
    rgb: [...swatch.rgb] as [number, number, number],
  }));

/**
 * Write the working set back to the library.
 *
 * When the playground was opened from a palette, this updates that palette in place rather than
 * leaving a second near-identical copy behind. "Detach" is there for when a fresh palette is what
 * you actually wanted.
 */
const saveToLibrary = () => {
  const linked = playgroundState.sourcePaletteId ? state.palettes.find((entry) => entry.id === playgroundState.sourcePaletteId) : undefined;

  if (linked) {
    linked.colors = currentColors();
    linked.lastModified = Date.now();
    syncActivePalette(linked.id);
    trackEvent("playground_palette_saved", { colors: linked.colors.length, style: playgroundState.style });
    appendLog(t("playground.updated", { name: linked.name }), "success");
    showToast(t("playground.updated", { name: linked.name }), "success");
    return;
  }

  const palette: Palette = {
    id: createId(),
    name: t("playground.paletteName", { style: playgroundStyleSelect?.selectedOptions[0]?.textContent ?? "" }).trim(),
    colors: currentColors(),
    lastModified: Date.now(),
    folderId: null,
  };
  state.palettes.unshift(palette);
  syncActivePalette(palette.id);
  // The new palette becomes the link, so pressing save twice does not create two copies.
  loadPaletteIntoPlayground(palette.id, palette.name, palette.colors);
  render();
  trackEvent("playground_palette_saved", { colors: palette.colors.length, style: playgroundState.style });
  appendLog(t("playground.saved", { name: palette.name }), "success");
  showToast(t("playground.saved", { name: palette.name }), "success");
};

/** Open a library palette in the playground and switch to the tab. */
export const openPaletteInPlayground = (paletteId: string) => {
  const palette = state.palettes.find((entry) => entry.id === paletteId);
  if (!palette) {
    return;
  }
  loadPaletteIntoPlayground(palette.id, palette.name, palette.colors);
  showPlaygroundView?.();
  render();
  trackEvent("playground_opened_from_library", { colors: palette.colors.length });
};

const shuffle = () => {
  shufflePlayground();
  render();
  trackEvent("playground_shuffled", { style: playgroundState.style, colors: playgroundState.swatches.length });
};

/** Called by the shell so the space shortcut and the scene only run while the tab is on screen. */
export const setPlaygroundActive = (active: boolean) => {
  isActive = active;
  if (active) {
    render();
  }
};

export const setupPlayground = () => {
  if (!playgroundRamp) {
    return;
  }
  restorePlayground();
  if (playgroundStyleSelect) {
    playgroundStyleSelect.value = playgroundState.style;
    // A style the select does not offer (an older build, a hand-edited value) falls back rather
    // than leaving the control blank.
    if (!playgroundStyleSelect.value) {
      playgroundStyleSelect.value = "analogous";
      setPlaygroundStyle("analogous");
    }
    playgroundStyleSelect.addEventListener("change", () => {
      setPlaygroundStyle(playgroundStyleSelect.value);
      shuffle();
    });
  }

  syncPlaygroundLabels();

  playgroundShuffleButton?.addEventListener("click", shuffle);
  playgroundAddButton?.addEventListener("click", () => {
    if (addPlaygroundSwatch()) {
      render();
    }
  });
  playgroundRemoveButton?.addEventListener("click", () => {
    if (removePlaygroundSwatch()) {
      render();
    }
  });
  playgroundSaveButton?.addEventListener("click", saveToLibrary);
  playgroundUndoButton?.addEventListener("click", () => {
    if (undoPlayground()) {
      render();
    }
  });
  playgroundRedoButton?.addEventListener("click", () => {
    if (redoPlayground()) {
      render();
    }
  });
  playgroundDetachButton?.addEventListener("click", () => {
    detachPlaygroundSource();
    renderChrome();
  });

  document.addEventListener("keydown", (event) => {
    if (!isActive || event.code !== "Space" || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const target = event.target;
    // Never steal the space bar from a control that has its own meaning for it.
    if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))) {
      return;
    }
    if (document.querySelector(".modal.is-open")) {
      return;
    }
    event.preventDefault();
    shuffle();
  });

  ensureSortable();
  renderSceneTabs();
  render();
  persistPlayground();
};

/** Re-render after a language or naming-format change, which both alter visible labels. */
export const refreshPlayground = () => {
  if (!playgroundRamp) {
    return;
  }
  syncPlaygroundLabels();
  renderSceneTabs();
  render();
};
