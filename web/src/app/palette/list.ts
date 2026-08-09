import { trackEvent } from "../cloud/analytics";
import { unpublishPalette, upsertPublicPalette } from "../cloud/lazy";
import { isCloudUserVerified, requireVerifiedCloudUser } from "../cloud/verification";
import { createFolderButton, exportModal, libraryEmptySearch, paletteList } from "../dom";
import { setExportMode, updateExportAvailability } from "../export/manager";
import { t } from "../i18n";
import { persistPalettes } from "../persistence";
import { openPaletteInPlayground } from "../playground/ui";
import { cloudState, libraryState, state } from "../state";
import type { Folder, Palette } from "../types";
import { createIconButton } from "../ui/buttons";
import { createIcon } from "../ui/icons";
import { setModalOpen } from "../ui/modals";
import { showToast } from "../ui/notifications";
import { createOverflowRow } from "../ui/overflow-row";
import { setupPopover } from "../ui/popover";
import { createSortable, isSortableClickSuppressed, isSortableDragActive, runAfterSortableDrag } from "../ui/sortable";
import { rgbToHex } from "../utils/color";
import { duplicatePalette } from "./duplicate";
import { openEditorForPalette } from "./editor";
import {
  UNFILED_FOLDER_ID,
  deleteFolder,
  getOpenFolderId,
  isFolderCollapsed,
  matchesLibrarySearch,
  moveFolderToIndex,
  movePaletteToFolderIndex,
  openFolder,
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
    chip.className = "palette-chip";
    chip.style.background = rgbToHex(color.rgb);
    chips.appendChild(chip);
  });
  if (remaining > 0) {
    const more = document.createElement("span");
    more.className = "palette-chip palette-chip-more";
    more.textContent = `+${remaining}`;
    more.title = t("palette.moreColors", { count: remaining });
    chips.appendChild(more);
  }
  return chips;
};

const createPaletteActions = (palette: Palette) => {
  const actions = document.createElement("div");
  actions.className = "palette-actions";

  const editButton = createIconButton({
    icon: "edit",
    label: t("action.edit"),
    iconOnly: true,
    onClick: (event) => {
      event.stopPropagation();
      openEditorForPalette(palette.id);
    },
  });

  const duplicateButton = createIconButton({
    icon: "duplicate",
    label: t("action.duplicate"),
    iconOnly: true,
    onClick: (event) => {
      event.stopPropagation();
      const copy = duplicatePalette(
        palette,
        state.palettes.map((item) => item.name),
      );
      copy.folderId = palette.folderId ?? null;
      state.palettes.unshift(copy);
      syncActivePalette(copy.id);
    },
  });

  const playgroundButton = createIconButton({
    icon: "playground",
    label: t("action.openInPlayground"),
    iconOnly: true,
    onClick: (event) => {
      event.stopPropagation();
      openPaletteInPlayground(palette.id);
    },
    actionKey: "playground",
  });

  const exportButton = createIconButton({
    icon: "export",
    label: t("action.export"),
    iconOnly: true,
    onClick: (event) => {
      event.stopPropagation();
      syncActivePalette(palette.id);
      setExportMode("single");
      setModalOpen(exportModal, true);
    },
  });

  const publishLabel = palette.isPublic ? t("action.unpublish") : t("action.publish");
  const publishButton = createIconButton({
    icon: "globe",
    label: publishLabel,
    iconOnly: true,
    onClick: (event) => {
      event.stopPropagation();
      void togglePaletteVisibility(palette.id);
    },
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

  const removeButton = createIconButton({
    icon: "trash",
    label: t("action.remove"),
    iconOnly: true,
    onClick: (event) => {
      event.stopPropagation();
      void removePalette(palette.id);
    },
  });

  /*
   * Six controls in a row that will not wrap, which on a phone is wider than the card holding them
   * — the row set the card's min-content width, so the card outgrew its grid column and its
   * contents spilled past the folder's edge.
   *
   * They spill into a "more" menu as the card narrows, keeping whatever fits: a card wide enough
   * for four buttons shows four. The order below is the order they are given up in, most useful
   * first, so editing survives longest and deleting — which nobody needs in a hurry — goes first.
   */
  /*
   * Two groups, and only one of them collapses.
   *
   * Publishing and deleting sit apart at the right because they are the two that change what the
   * palette *is* — everything else opens it somewhere. That separation should survive a narrow
   * card, so the right pair is never folded away; it is the working tools on the left that spill
   * into a "more" menu when the row runs out of room, keeping whatever fits.
   */
  const lead = document.createElement("div");
  lead.className = "palette-actions-lead";

  const primary = document.createElement("div");
  primary.className = "palette-actions-primary";
  primary.append(editButton, playgroundButton, duplicateButton, exportButton);

  const menu = document.createElement("div");
  menu.className = "palette-actions-menu";

  const moreButton = createIconButton({
    icon: "more",
    label: t("palette.actions"),
    iconOnly: true,
    className: "ghost palette-actions-more",
    actionKey: "palette-actions",
  });
  moreButton.setAttribute("aria-expanded", "false");
  moreButton.setAttribute("aria-haspopup", "true");
  lead.append(primary, moreButton, menu);

  const trailing = document.createElement("div");
  trailing.className = "palette-actions-trailing";
  trailing.append(publishButton, removeButton);

  actions.append(lead, trailing);
  const popover = setupPopover({ root: lead, trigger: moreButton, panel: menu });
  // Measured against the lead, not the whole row: the right pair is fixed, so the space the left
  // group actually has is its own box rather than the card's width.
  createOverflowRow({ row: lead, primary, menu, trigger: moreButton, onCollapse: popover.close });
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
  header.className = "section-head library-group-header";

  /*
   * Two targets, not one.
   *
   * The whole header used to collapse the folder, which left no way to say "show me this folder and
   * nothing else". The chevron keeps the collapse; the name opens the folder on its own.
   */
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "library-group-toggle";
  toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  toggle.setAttribute("aria-label", t(collapsed ? "folder.expand" : "folder.collapse"));
  toggle.title = t(collapsed ? "folder.expand" : "folder.collapse");
  const chevron = createIcon(collapsed ? "chevronDown" : "chevronUp");
  chevron.classList.add("library-group-chevron");
  toggle.appendChild(chevron);
  toggle.addEventListener("click", () => {
    if (header.querySelector(".library-group-rename")) {
      return;
    }
    toggleFolderCollapsed(group.id);
    renderPaletteList();
  });

  const open = document.createElement("button");
  open.type = "button";
  open.className = "library-group-open";
  open.title = t("folder.open");
  // A folder icon on real folders, a tray on Drafts: the two are different kinds of thing, and the
  // name alone did not say so.
  const kind = createIcon(group.folder ? "folder" : "inbox");
  kind.classList.add("library-group-icon");
  const label = document.createElement("span");
  label.className = "library-group-name";
  label.textContent = group.folder ? group.folder.name : t("folder.unfiled");
  const count = document.createElement("span");
  count.className = "palette-count";
  count.textContent = t("folder.count", { count: group.palettes.length });
  open.append(kind, label, count);
  open.addEventListener("click", () => {
    // Mid-rename the name is a text field, and clicking inside it must not navigate away.
    if (header.querySelector(".library-group-rename")) {
      return;
    }
    openFolder(group.id);
    renderPaletteList();
  });

  header.append(toggle, open);

  if (!group.folder) {
    return header;
  }

  const folder = group.folder;
  const actions = document.createElement("div");
  actions.className = "section-actions library-group-actions";

  /*
   * The same grip the palette cards use, in the same place: a bare glyph at the start of the row
   * rather than a circular icon button sitting among the actions. It was reading as a third action
   * — something to press — and it is not one; it is where you take hold of the folder.
   */
  const grip = document.createElement("span");
  grip.className = "library-group-grip";
  grip.setAttribute("role", "button");
  grip.setAttribute("aria-label", t("action.dragToReorder"));
  grip.title = t("action.dragToReorder");
  grip.appendChild(createIcon("grip"));

  /*
   * Rename in place rather than through `window.prompt`.
   *
   * The prompt is a no-op in Electron — it returns immediately without showing anything — so the
   * desktop build simply could not rename a folder. Editing the name where it sits works
   * everywhere, and is a better interaction on the web too.
   */
  const startRename = () => {
    if (header.querySelector(".library-group-rename")) {
      return;
    }
    const input = document.createElement("input");
    input.type = "text";
    input.className = "library-group-rename";
    input.value = folder.name;
    input.setAttribute("aria-label", t("folder.rename"));

    /*
     * The field grows with its text instead of stretching across the header. A hidden twin carries
     * the same typography, so measuring it gives the exact width the value needs — the same trick
     * the select chip uses to size itself to its value rather than its longest option.
     */
    const sizer = document.createElement("span");
    sizer.className = "library-group-rename-sizer";
    sizer.setAttribute("aria-hidden", "true");
    const fitToValue = () => {
      sizer.textContent = input.value || folder.name;
      const style = getComputedStyle(input);
      const chrome =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight) +
        Number.parseFloat(style.borderLeftWidth) +
        Number.parseFloat(style.borderRightWidth);
      // The extra two pixels are the caret's, which sits past the last glyph.
      input.style.width = `${Math.ceil(sizer.getBoundingClientRect().width + chrome) + 2}px`;
    };
    input.addEventListener("input", fitToValue);

    let settled = false;
    /*
     * Puts the label back itself rather than re-rendering the library.
     *
     * Blur commits, and a full re-render on blur replaced the header while the pointer was still
     * down on it: mousedown blurred the field, the button it was heading for was thrown away, and
     * mouseup landed on its replacement — so no click ever fired and the delete button did nothing.
     * A rename changes one string and neither the order nor the counts, so swapping that one node
     * back is the whole update.
     */
    const finish = (commit: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      if (commit) {
        renameFolder(folder.id, input.value);
      }
      label.textContent = folder.name;
      sizer.remove();
      input.replaceWith(label);
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    // Blur commits: clicking away from a half-typed name reads as "yes, that one".
    input.addEventListener("blur", () => finish(true));

    label.replaceWith(input);
    input.after(sizer);
    fitToValue();
    input.focus();
    input.select();
  };

  // Icon-only: the labels are long enough to crowd the name out of a narrow header.
  const renameButton = createIconButton({
    icon: "edit",
    label: t("folder.rename"),
    onClick: (event) => {
      event.stopPropagation();
      startRename();
    },
    iconOnly: true,
  });

  const removeButton = createIconButton({
    icon: "trash",
    label: t("folder.delete"),
    onClick: (event) => {
      event.stopPropagation();
      if (!window.confirm(t("folder.deleteConfirm", { name: folder.name, count: group.palettes.length }))) {
        return;
      }
      deleteFolder(folder.id);
      renderPaletteList();
    },
    iconOnly: true,
  });

  actions.append(renameButton, removeButton);
  // The grip leads the row, before the chevron, like the one on a palette card.
  header.prepend(grip);
  header.appendChild(actions);
  return header;
};

const createLibraryGroup = (group: LibraryGroup, isSearching: boolean) => {
  const section = document.createElement("section");
  /*
   * Not a `.section-card`. A folder is a band in the panel, and the card's rules kept re-imposing
   * card chrome on it — `.section-card--open > .section-head:first-child` rounds the header's top
   * corners, which is exactly the curve that made a list of folders read as a heap of separate
   * objects. Everything the class provided is declared for `.library-group` directly.
   */
  section.className = "library-group";
  section.dataset.folderId = group.id;

  const collapsed = !isSearching && isFolderCollapsed(group.id);
  section.classList.toggle("is-collapsed", collapsed);
  section.appendChild(createFolderHeader(group, collapsed));

  // A wrapper the collapse animation can size: the grid itself is the sortable container and must
  // keep its own layout.
  const body = document.createElement("div");
  body.className = "library-group-body";

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

  body.appendChild(grid);
  section.appendChild(body);
  return section;
};

let lastLevelKey = "";

/*
 * The step between the list of folders and one folder on its own.
 *
 * Only when the level actually changes. The list re-renders on every rename, every drop and every
 * cloud update, and animating all of those would leave the panel twitching. Direction follows the
 * move: opening a folder comes in from the right, going back from the left.
 */
const playLevelTransition = (root: HTMLElement) => {
  const key = `${root.dataset.level ?? ""}:${getOpenFolderId() ?? ""}`;
  const previous = lastLevelKey;
  lastLevelKey = key;
  if (!previous || previous === key) {
    return;
  }
  root.classList.remove("is-entering-in", "is-entering-out");
  // Forces the removal to take effect, so stepping between two folders replays the animation
  // instead of being treated as no change at all.
  void root.offsetWidth;
  root.classList.add(root.dataset.level === "folder" ? "is-entering-in" : "is-entering-out");
};

/*
 * The bar above an opened folder: a way back, the folder's name, and how much is in it.
 *
 * It is the app's section header again, so the folder you are inside reads as the same kind of
 * thing as the folder you clicked to get here.
 */
const createFolderCrumb = (group: LibraryGroup) => {
  const head = document.createElement("div");
  head.className = "section-head library-crumb";

  const back = createIconButton({
    icon: "chevronLeft",
    label: t("folder.backToLibrary"),
    onClick: () => {
      openFolder(null);
      renderPaletteList();
    },
    iconOnly: true,
    actionKey: "close-folder",
  });

  const title = document.createElement("h2");
  title.className = "section-title library-crumb-title";
  const kind = createIcon(group.folder ? "folder" : "inbox");
  kind.classList.add("library-group-icon");
  const name = document.createElement("span");
  name.className = "library-crumb-name";
  name.textContent = group.folder ? group.folder.name : t("folder.unfiled");
  const count = document.createElement("span");
  count.className = "palette-count";
  count.textContent = t("folder.count", { count: group.palettes.length });
  title.append(kind, name, count);

  head.append(back, title);
  return head;
};

/** One folder, filling the panel on its own. */
const createFolderView = (group: LibraryGroup, isSearching: boolean) => {
  const section = document.createElement("section");
  section.className = "section-card section-card--open library-group library-group--open";
  section.dataset.folderId = group.id;
  section.appendChild(createFolderCrumb(group));

  const body = document.createElement("div");
  body.className = "library-group-body";

  const grid = document.createElement("div");
  grid.className = "palette-grid";
  grid.dataset.folderId = group.folder ? group.folder.id : UNFILED_FOLDER_ID;
  group.palettes.forEach((palette) => grid.appendChild(createPaletteCard(palette)));

  if (group.palettes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty library-group-empty";
    // Inside the folder there is nothing to drag a palette *from*, so the invitation to drop one
    // reads as an instruction you cannot follow. It points at the dock instead.
    empty.textContent = isSearching ? t("library.search.emptyFolder") : t("folder.emptyOpen");
    grid.appendChild(empty);
  }

  body.appendChild(grid);
  section.appendChild(body);
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

  const hasMatches = visible.length > 0;
  libraryEmptySearch?.classList.toggle("is-hidden", !query || hasMatches);

  /*
   * A fresh install used to get a bare "no palettes yet" line, which left the panel with nothing in
   * it and nothing to drop onto. Drafts is always there instead, empty and ready — the library is
   * never a blank box.
   */
  const allGroups = buildGroups(visible);
  const openId = getOpenFolderId();
  const openGroup = openId ? allGroups.find((group) => group.id === openId) : undefined;

  paletteList.dataset.level = openGroup ? "folder" : "library";
  // Folders do not nest, so offering to make one while you are inside one offers something that
  // cannot happen. The toolbar keeps its search.
  createFolderButton?.classList.toggle("is-hidden", Boolean(openGroup));
  if (openGroup) {
    paletteList.appendChild(createFolderView(openGroup, Boolean(query)));
  } else {
    // While searching, folders with no match are hidden rather than shown empty.
    allGroups
      .filter((group) => !query || group.palettes.length > 0 || (!group.folder && !hasMatches))
      .forEach((group) => paletteList.appendChild(createLibraryGroup(group, Boolean(query))));
  }
  playLevelTransition(paletteList);

  updateExportAvailability();
  renderViewModal();
  window.dispatchEvent(new Event("actiondock:sync"));
};
