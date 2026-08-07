import { trackEvent } from "../cloud/analytics";
import { unpublishPalette, upsertPublicPalette } from "../cloud/lazy";
import { isCloudUserVerified, requireVerifiedCloudUser } from "../cloud/verification";
import { exportModal, libraryEmptySearch, paletteList } from "../dom";
import { setExportMode, updateExportAvailability } from "../export/manager";
import { t } from "../i18n";
import { persistPalettes } from "../persistence";
import { cloudState, libraryState, state } from "../state";
import type { Folder, Palette } from "../types";
import { createIcon, setButtonContent, type IconName } from "../ui/icons";
import { setModalOpen } from "../ui/modals";
import { showToast } from "../ui/notifications";
import { createSortable, isSortableClickSuppressed, isSortableDragActive, runAfterSortableDrag } from "../ui/sortable";
import { rgbToHex } from "../utils/color";
import { duplicatePalette } from "./duplicate";
import { openEditorForPalette } from "./editor";
import {
  UNFILED_FOLDER_ID,
  deleteFolder,
  isFolderCollapsed,
  matchesLibrarySearch,
  moveFolderToIndex,
  movePaletteToFolderIndex,
  renameFolder,
  toggleFolderCollapsed,
} from "./folders";
import { syncActivePalette } from "./mutations";
import { openViewForPalette, renderViewModal } from "./view";

const PREVIEW_CHIP_LIMIT = 10;

let paletteSortable: ReturnType<typeof createSortable> | null = null;

/**
 * Bind the sortables once. Both survive every re-render through event delegation on the stable
 * `#palette-list` root.
 */
const ensureSortables = () => {
  if (!paletteList || paletteSortable) {
    return;
  }
  paletteSortable = createSortable({
    root: paletteList,
    itemSelector: ".palette-card[data-palette-id]",
    // Grip only: the card body is a click target that opens the palette, so dragging from anywhere
    // on it made the two intents easy to confuse.
    handleSelector: ".palette-card-grip",
    // Cards may cross between folder grids, which is how a palette is filed.
    containerSelector: ".palette-grid[data-folder-id]",
    onDrop: ({ item, toContainer, toIndex }) => {
      const paletteId = item.dataset.paletteId;
      if (!paletteId) {
        return;
      }
      movePaletteToFolderIndex(paletteId, toContainer.dataset.folderId ?? null, toIndex);
      // The cards are already where they belong, so only the folder chrome needs updating. A full
      // rebuild here would replace the dropped card and cut its settle animation short.
      refreshLibraryChrome();
      updateExportAvailability();
      renderViewModal();
    },
  });
  // Not stored: `paletteSortable` alone is the "already bound" flag, and nothing ever needs a
  // handle back to the folder sortable.
  createSortable({
    root: paletteList,
    itemSelector: ".library-group[data-folder-id]:not([data-folder-id='__unfiled__'])",
    handleSelector: ".library-group-grip",
    onDrop: ({ fromIndex, toIndex }) => {
      moveFolderToIndex(fromIndex, toIndex);
      renderPaletteList();
    },
  });
};

const createIconButton = (icon: IconName, label: string, onClick: (event: MouseEvent) => void, iconOnly = false) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost";
  setButtonContent(button, icon, label, iconOnly);
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
  grip.setAttribute("role", "button");
  grip.setAttribute("aria-label", t("action.dragToReorder"));
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

  const duplicateButton = createIconButton("duplicate", t("action.duplicate"), (event) => {
    event.stopPropagation();
    const copy = duplicatePalette(
      palette,
      state.palettes.map((item) => item.name),
    );
    copy.folderId = palette.folderId ?? null;
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
  // The globe itself carries the published state, so there is no separate "PUBLIC" badge.
  publishButton.classList.toggle("is-published", Boolean(palette.isPublic));
  publishButton.setAttribute("aria-pressed", palette.isPublic ? "true" : "false");
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
  if (!cloudState.isConfigured || !cloudState.user) {
    showToast(t("palette.signInToPublishToast"), "info");
    return;
  }
  if (!requireVerifiedCloudUser()) {
    return;
  }
  if (palette.isPublic) {
    try {
      await unpublishPalette(palette);
      trackEvent("palette_unpublished");
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
      trackEvent("palette_published", { colors: palette.colors.length });
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

const createPaletteCard = (palette: Palette) => {
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
  return card;
};

/**
 * Update the parts of a folder group that depend on how many palettes it holds, without touching
 * the cards themselves.
 */
const refreshLibraryChrome = () => {
  if (!paletteList) {
    return;
  }
  paletteList.querySelectorAll<HTMLElement>(".library-group[data-folder-id]").forEach((section) => {
    const grid = section.querySelector<HTMLElement>(".palette-grid[data-folder-id]");
    if (!grid) {
      return;
    }
    const cardCount = grid.querySelectorAll(".palette-card").length;
    const count = section.querySelector<HTMLElement>(".library-group-header .palette-count");
    if (count) {
      count.textContent = t("folder.count", { count: cardCount });
    }
    const placeholder = grid.querySelector<HTMLElement>(".library-group-empty");
    if (cardCount === 0 && !placeholder) {
      const empty = document.createElement("p");
      empty.className = "empty library-group-empty";
      empty.textContent = t("folder.empty");
      grid.appendChild(empty);
    } else if (cardCount > 0 && placeholder) {
      placeholder.remove();
    }
  });
};

type LibraryGroup = {
  id: string;
  folder: Folder | null;
  palettes: Palette[];
};

const createFolderHeader = (group: LibraryGroup, collapsed: boolean) => {
  const header = document.createElement("div");
  header.className = "library-group-header";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "library-group-toggle";
  toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  const chevron = createIcon(collapsed ? "chevronDown" : "chevronUp");
  chevron.classList.add("library-group-chevron");
  const label = document.createElement("span");
  label.className = "library-group-name";
  label.textContent = group.folder ? group.folder.name : t("folder.unfiled");
  const count = document.createElement("span");
  count.className = "palette-count";
  count.textContent = t("folder.count", { count: group.palettes.length });
  toggle.append(chevron, label, count);
  toggle.addEventListener("click", () => {
    toggleFolderCollapsed(group.id);
    renderPaletteList();
  });
  header.appendChild(toggle);

  if (!group.folder) {
    return header;
  }

  const folder = group.folder;
  const actions = document.createElement("div");
  actions.className = "library-group-actions";

  const grip = document.createElement("button");
  grip.type = "button";
  grip.className = "ghost library-group-grip";
  setButtonContent(grip, "grip", t("action.dragToReorder"), true);

  // Icon-only: the labels are long enough to crowd the name out of a narrow header.
  const renameButton = createIconButton(
    "edit",
    t("folder.rename"),
    (event) => {
      event.stopPropagation();
      const nextName = window.prompt(t("folder.renamePrompt"), folder.name);
      if (nextName === null) {
        return;
      }
      renameFolder(folder.id, nextName);
      renderPaletteList();
    },
    true,
  );

  const removeButton = createIconButton(
    "trash",
    t("folder.delete"),
    (event) => {
      event.stopPropagation();
      if (!window.confirm(t("folder.deleteConfirm", { name: folder.name, count: group.palettes.length }))) {
        return;
      }
      deleteFolder(folder.id);
      renderPaletteList();
    },
    true,
  );

  actions.append(grip, renameButton, removeButton);
  header.appendChild(actions);
  return header;
};

const createLibraryGroup = (group: LibraryGroup, isSearching: boolean) => {
  const section = document.createElement("section");
  section.className = "library-group";
  section.dataset.folderId = group.id;

  const collapsed = !isSearching && isFolderCollapsed(group.id);
  section.classList.toggle("is-collapsed", collapsed);
  section.appendChild(createFolderHeader(group, collapsed));

  const grid = document.createElement("div");
  grid.className = "palette-grid";
  // The drop target for cross-folder drags; `null` folders use the sentinel id.
  grid.dataset.folderId = group.folder ? group.folder.id : UNFILED_FOLDER_ID;
  group.palettes.forEach((palette) => grid.appendChild(createPaletteCard(palette)));

  if (group.palettes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty library-group-empty";
    empty.textContent = isSearching ? t("library.search.emptyFolder") : t("folder.empty");
    grid.appendChild(empty);
  }

  section.appendChild(grid);
  return section;
};

/** Folders first in their own order, then the unfiled section. */
const buildGroups = (palettes: Palette[]): LibraryGroup[] => {
  const groups: LibraryGroup[] = state.folders.map((folder) => ({
    id: folder.id,
    folder,
    palettes: palettes.filter((palette) => palette.folderId === folder.id),
  }));
  groups.push({
    id: UNFILED_FOLDER_ID,
    folder: null,
    palettes: palettes.filter((palette) => !palette.folderId),
  });
  return groups;
};

export const renderPaletteList = () => {
  if (!paletteList) {
    return;
  }
  // Rebuilding the list replaces the card the pointer is holding, which aborts the drag. Callers
  // are no longer all user-initiated — a cloud sync or the lazily loaded auth state can land at any
  // moment — so the render waits for the drop instead of cancelling it.
  if (isSortableDragActive()) {
    runAfterSortableDrag(renderPaletteList);
    return;
  }
  ensureSortables();
  paletteList.innerHTML = "";

  const query = libraryState.search.trim().toLowerCase();
  const visible = query
    ? state.palettes.filter((palette) =>
        matchesLibrarySearch(
          palette,
          query,
          palette.colors.map((color) => rgbToHex(color.rgb).toLowerCase()),
        ),
      )
    : state.palettes;

  const hasAnyPalette = state.palettes.length > 0;
  const hasMatches = visible.length > 0;
  libraryEmptySearch?.classList.toggle("is-hidden", !query || hasMatches);

  if (!hasAnyPalette && state.folders.length === 0) {
    paletteList.innerHTML = `<p class="empty">${t("palette.empty")}</p>`;
    updateExportAvailability();
    window.dispatchEvent(new Event("actiondock:sync"));
    return;
  }

  // While searching, folders with no match are hidden rather than shown empty.
  const groups = buildGroups(visible).filter((group) => !query || group.palettes.length > 0 || (!group.folder && !hasMatches));
  groups.forEach((group) => paletteList.appendChild(createLibraryGroup(group, Boolean(query))));

  updateExportAvailability();
  renderViewModal();
  window.dispatchEvent(new Event("actiondock:sync"));
};
