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
import { openProfile } from "../cloud/lazy";
import { t } from "../i18n";
import { cloudState, discoveryState, state, viewState } from "../state";
import type { Palette, PublicPalette } from "../types";
import { setButtonContent } from "../ui/icons";
import { setModalOpen } from "../ui/modals";
import { showToast } from "../ui/notifications";
import type { QuickViewLayout } from "../types";
import { getColorMetrics, getContrastColor, rgbToHex } from "../utils/color";
import type { SharedPaletteAuthor } from "../share";
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
/** Who sent the link, when the link says. */
let sharedAuthor: SharedPaletteAuthor | null = null;

export const openViewForSharedPalette = (palette: Palette, author: SharedPaletteAuthor | null, onImport: () => void) => {
  sharedAuthor = author;
  viewState.paletteId = null;
  viewState.colorId = null;
  viewState.mode = "shared";
  viewState.publicPaletteId = null;
  viewState.sharedPalette = palette;
  onImportShared = onImport;
  renderViewModal();
  setModalOpen(viewModal, true);
};

/**
 * Runs the import the link handler handed over, then closes, and reports the id of the palette that
 * now exists in the library — so the caller can go on to open it. `null` outside a shared preview.
 */
export const runSharedImport = () => {
  if (viewState.mode !== "shared" || !onImportShared) {
    return null;
  }
  const run = onImportShared;
  const importedId = viewState.sharedPalette?.id ?? null;
  clearSharedPreview();
  setModalOpen(viewModal, false);
  run();
  return importedId;
};

const clearSharedPreview = () => {
  onImportShared = null;
  sharedAuthor = null;
  viewState.sharedPalette = null;
  viewState.mode = "local";
};

/*
 * Closing a shared preview is the decline, and it should say so.
 *
 * Nothing was taken and nothing changed, so there is nothing on screen afterwards to tell you which
 * way the choice went — the dialog simply disappears, exactly as it would have if the import had
 * worked. A line confirming the palette was not kept is the difference between a decision and a
 * dialog that got away from you.
 */
export const dismissSharedPreview = () => {
  if (viewState.mode !== "shared" || !onImportShared) {
    return;
  }
  clearSharedPreview();
  showToast(t("import.sharedDismissed"), "info");
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
  if (viewSaveEditButton) {
    // The same pair Discover offers, and for the same reason: taking the palette and opening it are
    // one intent, and having to save, dismiss, then hunt for it in the library is three steps for
    // something the button can do outright. It saves first — you cannot edit what you do not own.
    setButtonContent(viewSaveEditButton, "edit", t("action.saveEdit"), true);
    viewSaveEditButton.disabled = false;
    setHidden(viewSaveEditButton, false);
  }
  if (viewSaveButton) {
    // The same bookmark a Discover palette offers: taking a stranger's palette into your library
    // is the same act whether it arrived by feed or by link, so it should not look like two things.
    setButtonContent(viewSaveButton, "bookmark", t("action.save"), true);
    viewSaveButton.disabled = false;
    viewSaveButton.classList.remove("is-active");
    setHidden(viewSaveButton, false);
  }
};

/*
 * The subtitle with the author as a control rather than a run of text.
 *
 * The author is a button when there is a profile behind it, so the name you can see is the name you
 * can press — the Discover cards have worked that way for a while, and the dialog you reach from
 * them did not. The label is built from the same translated template, split on a placeholder so the
 * pieces stay in whatever order the language puts them.
 */
const AUTHOR_SLOT = " ";

const renderSubtitleWithAuthor = (
  paletteName: string,
  colorCountLabel: string,
  authorLabel: string,
  owner: { id: string; name?: string | null } | null,
) => {
  if (!viewSubtitle) {
    return;
  }
  const template = t("view.subtitleAuthor", { name: paletteName, colors: colorCountLabel, author: AUTHOR_SLOT });
  const [before, after = ""] = template.split(AUTHOR_SLOT);
  viewSubtitle.textContent = "";
  viewSubtitle.append(before);

  if (!owner) {
    viewSubtitle.append(authorLabel, after);
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "discover-author-button view-author-button";
  button.textContent = authorLabel;
  const openLabel = t("discover.profile.open", { name: owner.name?.trim() || owner.id });
  button.setAttribute("aria-label", openLabel);
  button.title = openLabel;
  button.addEventListener("click", () => openProfile(owner));
  viewSubtitle.append(button, after);
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

  /*
   * A shared link now carries the palette's name and whoever sent it, so the preview can say both
   * instead of "Shared palette" by nobody. The id is the fallback: a link made before there was a
   * name to put on it, or by an account that has not set one.
   */
  const sharedAuthorName = isSharedView ? sharedAuthor?.name?.trim() || sharedAuthor?.id?.trim() || "" : "";

  if (isDiscoverView && publicPalette) {
    const authorLabel = publicPalette.ownerName ? t("discover.by", { name: publicPalette.ownerName }) : t("discover.shared");
    renderSubtitleWithAuthor(
      viewPaletteName,
      colorCountLabel,
      authorLabel,
      publicPalette.ownerId ? { id: publicPalette.ownerId, name: publicPalette.ownerName } : null,
    );
  } else if (sharedAuthorName) {
    renderSubtitleWithAuthor(
      viewPaletteName,
      colorCountLabel,
      t("discover.by", { name: sharedAuthorName }),
      sharedAuthor?.id ? { id: sharedAuthor.id, name: sharedAuthor.name } : null,
    );
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
