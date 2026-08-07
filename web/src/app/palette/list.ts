import { firebaseClient } from "../cloud/context";
import { unpublishPalette, upsertPublicPalette } from "../cloud/public";
import { isCloudUserVerified, requireVerifiedCloudUser } from "../cloud/verification";
import { exportModal, paletteList } from "../dom";
import { setExportMode, updateExportAvailability } from "../export/manager";
import { t } from "../i18n";
import { persistPalettes } from "../persistence";
import { cloudState, state } from "../state";
import type { Palette } from "../types";
import { createIcon, setButtonContent } from "../ui/icons";
import { setModalOpen } from "../ui/modals";
import { showToast } from "../ui/notifications";
import { createSortable, isSortableClickSuppressed } from "../ui/sortable";
import { rgbToHex } from "../utils/color";
import { duplicatePalette } from "./duplicate";
import { openEditorForPalette } from "./editor";
import { movePaletteToIndex, syncActivePalette } from "./mutations";
import { openViewForPalette, renderViewModal } from "./view";

const PREVIEW_CHIP_LIMIT = 10;

let paletteListSortable: ReturnType<typeof createSortable> | null = null;

/** Bind the palette-card sortable once; it survives every re-render via event delegation. */
const ensurePaletteListSortable = () => {
  if (paletteListSortable || !paletteList) {
    return;
  }
  paletteListSortable = createSortable({
    root: paletteList,
    itemSelector: ".palette-card[data-palette-id]",
    onDrop: movePaletteToIndex,
  });
};

const createIconButton = (icon: string, label: string, onClick: (event: MouseEvent) => void) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost";
  setButtonContent(button, icon, label);
  button.setAttribute("aria-label", label);
  button.title = label;
  button.addEventListener("click", onClick);
  return button;
};

const createPaletteHeader = (palette: Palette) => {
  const header = document.createElement("div");
  header.className = "palette-card-header";

  const meta = document.createElement("div");
  meta.className = "palette-meta";

  const metaRow = document.createElement("div");
  metaRow.className = "palette-meta-row";

  // Affordance only: the whole card is draggable, but without a grip the card does not read as
  // reorderable at all.
  const grip = document.createElement("span");
  grip.className = "palette-card-grip";
  grip.setAttribute("aria-hidden", "true");
  grip.title = t("action.dragToReorder");
  grip.appendChild(createIcon("grip"));

  const title = document.createElement("div");
  title.className = "palette-title";
  title.textContent = palette.name;
  metaRow.append(grip, title);

  const metaBadges = document.createElement("div");
  metaBadges.className = "palette-meta-badges";
  const count = document.createElement("span");
  count.className = "palette-count";
  count.textContent = t("palette.colors", { count: palette.colors.length });
  metaBadges.appendChild(count);
  if (palette.isPublic) {
    const badge = document.createElement("span");
    badge.className = "palette-badge";
    badge.textContent = t("palette.public");
    metaBadges.appendChild(badge);
  }
  metaRow.appendChild(metaBadges);

  meta.append(metaRow);
  header.append(meta);
  return header;
};

const createPaletteChips = (palette: Palette) => {
  const chips = document.createElement("div");
  chips.className = "palette-chips";
  if (palette.colors.length === 0) {
    chips.classList.add("is-empty");
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = t("palette.noColors");
    chips.appendChild(empty);
    return chips;
  }

  const previewColors = palette.colors.slice(0, PREVIEW_CHIP_LIMIT);
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
  return chips;
};

const createPaletteActions = (palette: Palette) => {
  const actions = document.createElement("div");
  actions.className = "palette-actions";

  const editButton = createIconButton("edit", t("action.edit"), (event) => {
    event.stopPropagation();
    openEditorForPalette(palette.id);
  });

  const duplicateButton = createIconButton("files", t("action.duplicate"), (event) => {
    event.stopPropagation();
    const copy = duplicatePalette(
      palette,
      state.palettes.map((item) => item.name),
    );
    state.palettes.unshift(copy);
    syncActivePalette(copy.id);
  });

  const exportButton = createIconButton("export", t("action.export"), (event) => {
    event.stopPropagation();
    syncActivePalette(palette.id);
    setExportMode("single");
    setModalOpen(exportModal, true);
  });

  const spacer = document.createElement("span");
  spacer.className = "palette-actions-spacer";

  const publishLabel = palette.isPublic ? t("action.unpublish") : t("action.publish");
  const publishButton = createIconButton("globe", publishLabel, (event) => {
    event.stopPropagation();
    void togglePaletteVisibility(palette.id);
  });
  publishButton.title = cloudState.user
    ? isCloudUserVerified()
      ? publishLabel
      : t("palette.verifyToPublish")
    : t("palette.signInToPublish");
  publishButton.disabled = !cloudState.isConfigured || !cloudState.user || !isCloudUserVerified();

  const removeButton = createIconButton("trash", t("action.remove"), (event) => {
    event.stopPropagation();
    void removePalette(palette.id);
  });

  actions.append(editButton, duplicateButton, exportButton, spacer, publishButton, removeButton);
  return actions;
};

/**
 * Delete a palette locally. When it was published, the public copy is withdrawn from Discover, but
 * anyone who saved it keeps their own independent copy — saves are full local duplicates, never
 * references back to the original document.
 */
export const removePalette = async (paletteId: string) => {
  const palette = state.palettes.find((item) => item.id === paletteId);
  if (!palette) {
    return;
  }
  if (!window.confirm(t("palette.removeConfirm", { name: palette.name }))) {
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
  state.palettes = state.palettes.filter((item) => item.id !== paletteId);
  syncActivePalette(state.palettes[0]?.id ?? null);
};

export const togglePaletteVisibility = async (paletteId: string) => {
  const palette = state.palettes.find((item) => item.id === paletteId);
  if (!palette) {
    return;
  }
  if (!firebaseClient || !cloudState.user) {
    showToast(t("palette.signInToPublishToast"), "info");
    return;
  }
  if (!requireVerifiedCloudUser()) {
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
      // Roll the local flag back so the card does not claim to be published when it is not.
      palette.isPublic = false;
      palette.publicId = null;
      persistPalettes();
      showToast(t("toast.palettePublishFailed"), "error");
    }
  }
  renderPaletteList();
};

export const renderPaletteList = () => {
  if (!paletteList) {
    return;
  }
  ensurePaletteListSortable();
  paletteList.innerHTML = "";

  if (state.palettes.length === 0) {
    paletteList.innerHTML = `<p class="empty">${t("palette.empty")}</p>`;
    updateExportAvailability();
    window.dispatchEvent(new Event("actiondock:sync"));
    return;
  }

  for (const palette of state.palettes) {
    const card = document.createElement("article");
    card.dataset.paletteId = palette.id;
    card.className = palette.id === state.activePaletteId ? "palette-card is-active" : "palette-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.addEventListener("click", (event) => {
      // Swallow the click that terminates a drag so reordering never opens the palette.
      if (isSortableClickSuppressed()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      openViewForPalette(palette.id);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openViewForPalette(palette.id);
      }
    });

    const footer = document.createElement("div");
    footer.className = "palette-card-footer";
    footer.append(createPaletteActions(palette));

    card.append(createPaletteHeader(palette), createPaletteChips(palette), footer);
    paletteList.appendChild(card);
  }

  updateExportAvailability();
  renderViewModal();
  window.dispatchEvent(new Event("actiondock:sync"));
};
