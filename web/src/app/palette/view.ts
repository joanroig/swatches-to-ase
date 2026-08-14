import {
  viewBlocks,
  viewDisplay,
  viewLayoutButtons,
  viewLikeButton,
  viewLikeCount,
  viewModal,
  viewPublicMeta,
  viewSaveButton,
  viewSaveEditButton,
  viewStrip,
  viewSubtitle,
  viewTitle,
  viewValues,
} from "../dom";
import { t } from "../i18n";
import { cloudState, discoveryState, state, viewState } from "../state";
import type { Palette, PublicPalette } from "../types";
import { setButtonContent } from "../ui/icons";
import { setModalOpen } from "../ui/modals";
import type { QuickViewLayout } from "../types";
import { getColorMetrics, getContrastColor, rgbToHex } from "../utils/color";
import { readStoredText, writeStoredText } from "../utils/storage";
import { resolveActiveNameFormat } from "./format";
import { getPaletteById, syncActivePalette } from "./mutations";
import { nameColor } from "./naming";

const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const VIEW_LAYOUT_STORAGE_KEY = "palette-studio.quick-view-layout";
let viewLayoutReady = false;

const isQuickViewLayout = (value: string | null): value is QuickViewLayout => value === "details" || value === "blocks";

const syncViewLayout = (hasColors: boolean) => {
  const showBlocks = hasColors && viewState.layout === "blocks";
  viewDisplay?.classList.toggle("is-hidden", showBlocks);
  viewStrip?.classList.toggle("is-hidden", showBlocks);
  viewBlocks?.classList.toggle("is-hidden", !showBlocks);

  viewLayoutButtons.forEach((button) => {
    const layout = button.dataset.viewLayout as QuickViewLayout;
    const selected = layout === viewState.layout;
    setButtonContent(button, layout === "details" ? "view" : "rows", t(`view.layout.${layout}`));
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.disabled = !hasColors;
  });
};

const ensureViewLayout = () => {
  if (viewLayoutReady) {
    return;
  }
  viewLayoutReady = true;
  const stored = readStoredText(VIEW_LAYOUT_STORAGE_KEY);
  if (isQuickViewLayout(stored)) {
    viewState.layout = stored;
  }
  viewLayoutButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const layout = button.dataset.viewLayout;
      if (!isQuickViewLayout(layout) || layout === viewState.layout) {
        return;
      }
      viewState.layout = layout;
      writeStoredText(VIEW_LAYOUT_STORAGE_KEY, layout);
      renderViewModal();
    });
  });
};

export const openViewForPalette = (paletteId: string) => {
  syncActivePalette(paletteId);
  viewState.paletteId = paletteId;
  viewState.colorId = null;
  viewState.mode = "local";
  viewState.publicPaletteId = null;
  viewState.sharedPalette = null;
  renderViewModal();
  setModalOpen(viewModal, true);
};

/*
 * Someone else's palette, arriving by link.
 *
 * It is shown before it is imported rather than after: a share link used to raise a browser confirm
 * naming the palette, which asked you to accept colors you could not see. The preview is the one
 * the app already has, with the action row reduced to the only choice that makes sense here.
 */
let onImportShared: (() => void) | null = null;

export const openViewForSharedPalette = (palette: Palette, onImport: () => void) => {
  viewState.paletteId = null;
  viewState.colorId = null;
  viewState.mode = "shared";
  viewState.publicPaletteId = null;
  viewState.sharedPalette = palette;
  onImportShared = onImport;
  renderViewModal();
  setModalOpen(viewModal, true);
};

/** Runs the import the link handler handed over, then closes. `null` outside a shared preview. */
export const runSharedImport = () => {
  if (viewState.mode !== "shared" || !onImportShared) {
    return false;
  }
  const run = onImportShared;
  onImportShared = null;
  viewState.sharedPalette = null;
  viewState.mode = "local";
  setModalOpen(viewModal, false);
  run();
  return true;
};

export const openViewForPublicPalette = (palette: PublicPalette) => {
  viewState.paletteId = null;
  viewState.colorId = null;
  viewState.mode = "discover";
  viewState.publicPaletteId = palette.id;
  viewState.sharedPalette = null;
  renderViewModal();
  setModalOpen(viewModal, true);
};

const setHidden = (element: HTMLElement | null, hidden: boolean) => {
  element?.classList.toggle("is-hidden", hidden);
};

/** Configure the like/save/edit row for a public palette shown from Discover. */
const renderDiscoverActions = (publicPalette: PublicPalette) => {
  const isOwner = Boolean(cloudState.user && publicPalette.ownerId === cloudState.user.uid);
  const isLiked = discoveryState.likedIds.has(publicPalette.id);
  const isSaved = discoveryState.savedIds.has(publicPalette.id);

  if (viewSaveEditButton) {
    setButtonContent(viewSaveEditButton, "edit", t("action.saveEdit"), true);
    viewSaveEditButton.disabled = isOwner;
    setHidden(viewSaveEditButton, false);
  }
  if (viewLikeButton) {
    setButtonContent(viewLikeButton, "heart", isLiked ? t("action.liked") : t("action.like"), true);
    viewLikeButton.classList.toggle("is-active", isLiked);
    viewLikeButton.disabled = isOwner;
    setHidden(viewLikeButton, false);
  }
  if (viewSaveButton) {
    setButtonContent(viewSaveButton, "bookmark", isSaved ? t("action.saved") : t("action.save"), true);
    viewSaveButton.classList.toggle("is-active", isSaved);
    // Saving is one-shot: an already-saved palette stays saved and the count never moves again.
    viewSaveButton.disabled = isOwner || isSaved;
    setHidden(viewSaveButton, false);
  }
  if (viewLikeCount) {
    viewLikeCount.textContent = compactNumber.format(Math.max(0, publicPalette.likesCount ?? 0));
    setHidden(viewLikeCount, false);
  }
};

/** Configure the action row for a palette owned by this device. */
const renderLocalActions = (hasPalette: boolean) => {
  if (viewLikeCount) {
    viewLikeCount.textContent = "";
    setHidden(viewLikeCount, true);
  }
  if (viewLikeButton) {
    viewLikeButton.disabled = false;
    viewLikeButton.classList.remove("is-active");
    setHidden(viewLikeButton, true);
  }
  if (viewSaveEditButton) {
    setButtonContent(viewSaveEditButton, "edit", t("action.edit"), true);
    viewSaveEditButton.disabled = !hasPalette;
    setHidden(viewSaveEditButton, !hasPalette);
  }
  if (viewSaveButton) {
    viewSaveButton.disabled = false;
    viewSaveButton.classList.remove("is-active");
    setHidden(viewSaveButton, true);
  }
};

/** Import or dismiss, and nothing else: a palette you do not have yet cannot be liked or edited. */
const renderSharedActions = () => {
  if (viewLikeCount) {
    viewLikeCount.textContent = "";
    setHidden(viewLikeCount, true);
  }
  setHidden(viewLikeButton, true);
  setHidden(viewSaveEditButton, true);
  if (viewSaveButton) {
    setButtonContent(viewSaveButton, "import", t("action.import"), true);
    viewSaveButton.disabled = false;
    viewSaveButton.classList.remove("is-active");
    setHidden(viewSaveButton, false);
  }
};

export const renderViewModal = () => {
  if (!viewDisplay || !viewValues || !viewStrip || !viewBlocks || !viewSubtitle) {
    return;
  }
  ensureViewLayout();
  const isSharedView = viewState.mode === "shared" && Boolean(viewState.sharedPalette);
  const isDiscoverView = viewState.mode === "discover" && Boolean(viewState.publicPaletteId);
  const publicPalette = isDiscoverView ? discoveryState.palettes.find((palette) => palette.id === viewState.publicPaletteId) : null;
  const palette = isSharedView
    ? viewState.sharedPalette
    : isDiscoverView
      ? null
      : getPaletteById(viewState.paletteId ?? state.activePaletteId);

  viewValues.innerHTML = "";
  viewStrip.innerHTML = "";
  viewBlocks.innerHTML = "";

  if (viewPublicMeta) {
    setHidden(viewPublicMeta, !(publicPalette || (!isDiscoverView && palette)));
  }
  // The heading says whose palette this is. "Quick view" is right for your own and for one you are
  // browsing; a link from someone else is a different situation and should say so.
  if (viewTitle) {
    viewTitle.textContent = t(isSharedView ? "view.titleShared" : "view.title");
  }
  if (isSharedView) {
    renderSharedActions();
  } else if (isDiscoverView && publicPalette) {
    renderDiscoverActions(publicPalette);
  } else {
    renderLocalActions(Boolean(palette));
  }

  if (isDiscoverView && !publicPalette) {
    viewState.publicPaletteId = null;
  }

  if (!palette && !publicPalette) {
    viewState.paletteId = null;
    viewState.colorId = null;
    viewDisplay.classList.add("is-empty");
    viewDisplay.style.background = "";
    viewDisplay.style.color = "";
    viewSubtitle.textContent = t("view.emptySubtitle");
    viewValues.textContent = t("view.empty");
    syncViewLayout(false);
    return;
  }

  const viewPaletteName = (isDiscoverView && publicPalette ? publicPalette.name : palette?.name) ?? "";
  const viewPaletteColors = (isDiscoverView && publicPalette ? publicPalette.colors : palette?.colors) ?? [];
  const colorCountLabel = t("palette.colors", { count: viewPaletteColors.length });

  if (isDiscoverView && publicPalette) {
    const authorLabel = publicPalette.ownerName ? t("discover.by", { name: publicPalette.ownerName }) : t("discover.shared");
    viewSubtitle.textContent = t("view.subtitleAuthor", {
      name: viewPaletteName,
      colors: colorCountLabel,
      author: authorLabel,
    });
  } else {
    viewSubtitle.textContent = t("view.subtitle", {
      name: viewPaletteName,
      count: viewPaletteColors.length,
      colors: colorCountLabel,
    });
  }

  if (viewPaletteColors.length === 0) {
    viewState.colorId = null;
    viewDisplay.classList.add("is-empty");
    viewDisplay.style.background = "";
    viewDisplay.style.color = "";
    viewValues.textContent = t("view.emptyColors");
    syncViewLayout(false);
    return;
  }

  const resolvedColors =
    isDiscoverView && publicPalette
      ? publicPalette.colors.map((color, index) => ({
          id: `${publicPalette.id}-${index}`,
          name: nameColor(rgbToHex(color.rgb).toUpperCase(), resolveActiveNameFormat(), index),
          rgb: [...color.rgb] as [number, number, number],
        }))
      : (palette?.colors ?? []);

  const activeColor = resolvedColors.find((color) => color.id === viewState.colorId) ?? resolvedColors[0];
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

  resolvedColors.forEach((color) => {
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

    const block = document.createElement("div");
    block.className = "view-block";
    block.style.background = rgbToHex(color.rgb);
    block.style.color = getContrastColor(color.rgb);
    const blockValue = document.createElement("span");
    blockValue.className = "view-block-value";
    blockValue.textContent = rgbToHex(color.rgb).toUpperCase();
    const blockName = document.createElement("span");
    blockName.className = "view-block-name";
    blockName.textContent = color.name;
    block.append(blockValue, blockName);
    viewBlocks.appendChild(block);
  });

  syncViewLayout(true);
};
