import {
  viewDisplay,
  viewLikeButton,
  viewLikeCount,
  viewModal,
  viewPublicMeta,
  viewSaveButton,
  viewSaveEditButton,
  viewStrip,
  viewSubtitle,
  viewValues,
} from "../dom";
import { t } from "../i18n";
import { cloudState, discoveryState, state, viewState } from "../state";
import type { PublicPalette } from "../types";
import { setButtonContent } from "../ui/icons";
import { setModalOpen } from "../ui/modals";
import { getColorMetrics, getContrastColor, rgbToHex } from "../utils/color";
import { resolveActiveNameFormat } from "./format";
import { getPaletteById, syncActivePalette } from "./mutations";
import { nameColor } from "./naming";

const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

export const openViewForPalette = (paletteId: string) => {
  syncActivePalette(paletteId);
  viewState.paletteId = paletteId;
  viewState.colorId = null;
  viewState.mode = "local";
  viewState.publicPaletteId = null;
  renderViewModal();
  setModalOpen(viewModal, true);
};

export const openViewForPublicPalette = (palette: PublicPalette) => {
  viewState.paletteId = null;
  viewState.colorId = null;
  viewState.mode = "discover";
  viewState.publicPaletteId = palette.id;
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

export const renderViewModal = () => {
  if (!viewDisplay || !viewValues || !viewStrip || !viewSubtitle) {
    return;
  }
  const isDiscoverView = viewState.mode === "discover" && Boolean(viewState.publicPaletteId);
  const publicPalette = isDiscoverView
    ? discoveryState.palettes.find((palette) => palette.id === viewState.publicPaletteId)
    : null;
  const palette = isDiscoverView ? null : getPaletteById(viewState.paletteId ?? state.activePaletteId);

  viewValues.innerHTML = "";
  viewStrip.innerHTML = "";

  if (viewPublicMeta) {
    setHidden(viewPublicMeta, !(publicPalette || (!isDiscoverView && palette)));
  }
  if (isDiscoverView && publicPalette) {
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
    return;
  }

  const viewPaletteName = (isDiscoverView && publicPalette ? publicPalette.name : palette?.name) ?? "";
  const viewPaletteColors = (isDiscoverView && publicPalette ? publicPalette.colors : palette?.colors) ?? [];
  const colorCountLabel = t("palette.colors", { count: viewPaletteColors.length });

  if (isDiscoverView && publicPalette) {
    const authorLabel = publicPalette.ownerName
      ? t("discover.by", { name: publicPalette.ownerName })
      : t("discover.shared");
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
  });
};
