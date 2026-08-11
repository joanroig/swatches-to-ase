import { trackEvent } from "../cloud/analytics";
import { openColorTools } from "../color/tools";
import {
  playgroundDetachButton,
  playgroundFullscreenButton,
  playgroundHint,
  playgroundLead,
  playgroundPreview,
  playgroundRamp,
  playgroundRedoButton,
  playgroundSaveButton,
  playgroundSceneTabs,
  playgroundShuffleButton,
  playgroundSource,
  playgroundSourceText,
  playgroundStage,
  playgroundStyleSelect,
  playgroundUndoButton,
  playgroundZoomInButton,
  playgroundZoomOutButton,
  playgroundZoomValue,
} from "../dom";
import { t } from "../i18n";
import { syncActivePalette } from "../palette/mutations";
import { state } from "../state";
import type { Palette } from "../types";
import { createIconButton } from "../ui/buttons";
import { createIcon, setButtonContent, type IconName } from "../ui/icons";
import { appendLog, showToast } from "../ui/notifications";
import { createOverflowRow } from "../ui/overflow-row";
import { setupPopover } from "../ui/popover";
import { createSelectChip } from "../ui/select-chip";
import { createSortable, isSortableClickSuppressed } from "../ui/sortable";
import { getContrastColor, rgbToHex } from "../utils/color";
import { createId } from "../utils/id";
import { SCENE_IDS, buildScene, isSceneId, type SceneId } from "./scenes";
import {
  canRedoPlayground,
  canStepPlaygroundZoom,
  canUndoPlayground,
  detachPlaygroundSource,
  insertPlaygroundSwatch,
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
  stepPlaygroundZoom,
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

let isFullscreen = false;
/** Marks where the preview came from, so leaving full screen can put it back. */
let previewAnchor: Comment | null = null;

export const setPlaygroundViewSwitcher = (switcher: () => void) => {
  showPlaygroundView = switcher;
};

const currentHexes = () => playgroundState.swatches.map((swatch) => rgbToHex(swatch.rgb).toUpperCase());

const createSwatchButton = (icon: IconName, label: string, onClick: () => void) =>
  createIconButton({
    icon,
    label,
    iconOnly: true,
    className: "ghost icon-only playground-swatch-action",
    // The swatch itself is a click target, so its controls must not also trigger it.
    onClick: (event) => {
      event.stopPropagation();
      onClick();
    },
  });

/**
 * A "+" that inserts a color at a position, revealed by hovering the seam between two swatches.
 *
 * Same affordance as the palette editor, and the reason the toolbar no longer carries a count
 * stepper: adding a color *somewhere specific* is what people actually want, and a bare "+1"
 * could only ever append.
 */
const createInsertZone = (index: number, atEnd = false) => {
  const zone = document.createElement("span");
  zone.className = atEnd ? "playground-insert-zone playground-insert-zone--end" : "playground-insert-zone";

  const button = createIconButton({
    icon: "plus",
    label: t("action.insertColor"),
    iconOnly: true,
    className: "playground-insert",
    onClick: (event) => {
      event.stopPropagation();
      if (!insertPlaygroundSwatch(index)) {
        showToast(t("playground.maxColors", { count: playgroundLimits.max }), "info");
        return;
      }
      render();
    },
  });

  zone.appendChild(button);
  return zone;
};

const renderRamp = () => {
  if (!playgroundRamp) {
    return;
  }
  playgroundRamp.innerHTML = "";
  playgroundState.swatches.forEach((swatch, index) => {
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
    // color tools, so dragging from anywhere on it would make the two intents ambiguous.
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

    actions.append(lock, remove);

    const label = document.createElement("button");
    label.type = "button";
    label.className = "playground-swatch-label";
    label.style.color = ink;
    label.title = t("playground.editColor");
    const hexLine = document.createElement("span");
    hexLine.className = "playground-swatch-hex";
    hexLine.textContent = hex;
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

    // Keep the same flat architecture as palette editing: handle, identity, then actions. CSS can
    // turn that sequence into columns on wide screens without changing the mobile reading order.
    column.append(grip, label, actions, createInsertZone(index));
    if (index === playgroundState.swatches.length - 1) {
      column.appendChild(createInsertZone(index + 1, true));
    }
    playgroundRamp.appendChild(column);
  });
};

/*
 * The tabs are rebuilt whenever the scene changes, so the overflow row that manages them has to be
 * torn down and rebuilt with them — each one owns a `ResizeObserver`, and leaving the old one
 * watching a detached strip would leak one per click.
 */
let sceneOverflow: ReturnType<typeof createOverflowRow> | null = null;

const renderSceneTabs = () => {
  if (!playgroundSceneTabs) {
    return;
  }
  sceneOverflow?.destroy();
  sceneOverflow = null;
  playgroundSceneTabs.innerHTML = "";

  /*
   * Four scene names do not fit a phone-width preview header, and a strip that scrolls sideways is
   * a poor way to offer four choices: the ones off the end are invisible rather than merely small.
   * Whatever fits stays a tab, and the rest fold into a menu — the same arrangement the palette
   * cards use for their tools.
   */
  const primary = document.createElement("div");
  primary.className = "playground-scene-primary";

  const menu = document.createElement("div");
  menu.className = "playground-scene-menu";

  const more = createIconButton({
    icon: "more",
    label: t("action.moreActions"),
    iconOnly: true,
    className: "chip chip--icon playground-scene-more",
  });
  more.setAttribute("aria-expanded", "false");
  more.setAttribute("aria-haspopup", "true");

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
    primary.appendChild(button);
  });

  playgroundSceneTabs.append(primary, more, menu);
  const popover = setupPopover({ root: playgroundSceneTabs, trigger: more, panel: menu });
  const syncOverflowSelection = () => {
    const selected = menu.querySelector<HTMLElement>(".playground-scene-tab.is-active");
    const label = selected?.textContent?.trim();
    more.classList.toggle("is-active", Boolean(selected));
    more.setAttribute("aria-label", label ? `${t("action.moreActions")}: ${label}` : t("action.moreActions"));
  };
  sceneOverflow = createOverflowRow({
    row: playgroundSceneTabs,
    primary,
    menu,
    trigger: more,
    onCollapse: popover.close,
    onChange: syncOverflowSelection,
  });
};

/**
 * Take the preview full screen.
 *
 * The Fullscreen API, so it fills the display rather than the app window. A fallback keeps the
 * feature working where the request is refused — an iframe without `allow="fullscreen"`, an
 * unsupported browser — by pinning the preview over the page instead.
 *
 * The fallback has to move the element to `<body>`: `.panel-playground` declares
 * `container-type: inline-size`, which makes it a containing block for fixed-position descendants,
 * so `inset: 0` would resolve against the panel and stop at the sidebar. The native path needs no
 * such trick because a fullscreen element is promoted to the top layer.
 */
const syncFullscreenChrome = (next: boolean) => {
  isFullscreen = next;
  playgroundPreview?.classList.toggle("is-fullscreen", next);
  setButtonContent(playgroundZoomInButton, "plus", t("playground.zoomIn"), true);
  setButtonContent(playgroundZoomOutButton, "minus", t("playground.zoomOut"), true);
  setButtonContent(
    playgroundFullscreenButton,
    next ? "collapse" : "expand",
    t(next ? "playground.exitFullscreen" : "playground.fullscreen"),
    true,
  );
  playgroundFullscreenButton?.setAttribute("aria-pressed", next ? "true" : "false");
};

const setFallbackFullscreen = (next: boolean) => {
  if (!playgroundPreview) {
    return;
  }
  if (next && !previewAnchor) {
    previewAnchor = document.createComment("playground-preview");
    playgroundPreview.replaceWith(previewAnchor);
    document.body.appendChild(playgroundPreview);
  } else if (!next && previewAnchor) {
    previewAnchor.replaceWith(playgroundPreview);
    previewAnchor = null;
  }
  playgroundPreview.classList.toggle("is-fullscreen-fallback", next);
  document.body.classList.toggle("has-playground-fullscreen", next);
  syncFullscreenChrome(next);
};

const setFullscreen = (next: boolean) => {
  if (!playgroundPreview) {
    return;
  }
  if (!next) {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => setFallbackFullscreen(false));
      return;
    }
    setFallbackFullscreen(false);
    return;
  }
  if (document.fullscreenEnabled && playgroundPreview.requestFullscreen) {
    // Called straight from the click handler: the request needs the user gesture still on the stack.
    playgroundPreview.requestFullscreen().catch(() => setFallbackFullscreen(true));
    return;
  }
  setFallbackFullscreen(true);
};

const renderZoom = () => {
  playgroundStage?.style.setProperty("--scene-zoom", String(playgroundState.zoom));
  if (playgroundZoomValue) {
    playgroundZoomValue.textContent = `${Math.round(playgroundState.zoom * 100)}%`;
  }
  if (playgroundZoomInButton) {
    playgroundZoomInButton.disabled = !canStepPlaygroundZoom(1);
  }
  if (playgroundZoomOutButton) {
    playgroundZoomOutButton.disabled = !canStepPlaygroundZoom(-1);
  }
};

const renderStage = () => {
  if (!playgroundStage) {
    return;
  }
  const scene: SceneId = isSceneId(playgroundState.scene) ? playgroundState.scene : "blend";
  playgroundStage.innerHTML = "";
  playgroundStage.appendChild(buildScene(scene, currentHexes()));
  renderZoom();
};

const renderChrome = () => {
  const linked = Boolean(playgroundState.sourcePaletteId);
  playgroundSource?.classList.toggle("is-hidden", !linked);
  // The lead slot holds one or the other, never both. `data-mode` lets the stylesheet drop the
  // hint on a narrow bar without also dropping the "Editing <palette>" note, which is not advice.
  playgroundHint?.classList.toggle("is-hidden", linked);
  if (playgroundLead) {
    playgroundLead.dataset.mode = linked ? "source" : "hint";
  }
  if (playgroundSourceText && linked) {
    playgroundSourceText.textContent = t("playground.editing", { name: playgroundState.sourceName ?? "" });
  }
  if (playgroundSaveButton) {
    setButtonContent(playgroundSaveButton, "bookmark", t(linked ? "playground.update" : "playground.save"));
    playgroundSaveButton.classList.add("playground-chip");
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
/**
 * The bar's chips, rebuilt on every language change.
 *
 * `setButtonContent` clears and re-fills the button, which also wipes the chip classes it must
 * keep. Re-adding them here is cheaper than teaching the shared helper about callers that style
 * their own buttons.
 */
const CHIP_BUTTONS: Array<[HTMLButtonElement | null, string[]]> = [
  [playgroundShuffleButton, ["playground-chip", "playground-chip--primary"]],
  [playgroundUndoButton, ["playground-chip", "playground-chip--icon"]],
  [playgroundRedoButton, ["playground-chip", "playground-chip--icon"]],
  [playgroundSaveButton, ["playground-chip"]],
];

const syncPlaygroundLabels = () => {
  setButtonContent(playgroundShuffleButton, "refresh", t("playground.shuffle"));
  playgroundShuffleButton?.setAttribute("aria-keyshortcuts", "Space");
  setButtonContent(playgroundSaveButton, "bookmark", t("playground.save"));
  setButtonContent(playgroundUndoButton, "undo", t("action.undo"), true);
  setButtonContent(playgroundRedoButton, "redo", t("action.redo"), true);
  setButtonContent(playgroundZoomInButton, "plus", t("playground.zoomIn"), true);
  setButtonContent(playgroundZoomOutButton, "minus", t("playground.zoomOut"), true);
  setButtonContent(
    playgroundFullscreenButton,
    isFullscreen ? "collapse" : "expand",
    t(isFullscreen ? "playground.exitFullscreen" : "playground.fullscreen"),
    true,
  );
  CHIP_BUTTONS.forEach(([button, classNames]) => button?.classList.add(...classNames));
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
    // The tab strip is created while this view is hidden, when it has no measurable width. Refresh
    // it synchronously after the shell reveals the view so all tabs never flash before collapsing.
    sceneOverflow?.refresh();
    render();
    return;
  }
  // Leaving the tab must not leave a full-screen overlay covering the view you switched to.
  if (isFullscreen) {
    setFullscreen(false);
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

  document.addEventListener("keydown", (event) => {
    // Only the fallback needs this; the native path gets Escape from the browser.
    if (event.key === "Escape" && isFullscreen && !document.fullscreenElement) {
      setFullscreen(false);
    }
  });

  createSelectChip(playgroundStyleSelect);

  playgroundZoomInButton?.addEventListener("click", () => {
    if (stepPlaygroundZoom(1)) {
      renderZoom();
    }
  });
  playgroundZoomOutButton?.addEventListener("click", () => {
    if (stepPlaygroundZoom(-1)) {
      renderZoom();
    }
  });
  playgroundFullscreenButton?.addEventListener("click", () => setFullscreen(!isFullscreen));
  // The browser owns the native path — Escape, F11 and the exit chrome all land here.
  document.addEventListener("fullscreenchange", () => {
    syncFullscreenChrome(document.fullscreenElement === playgroundPreview);
  });

  ensureSortable();
  syncFullscreenChrome(false);
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
