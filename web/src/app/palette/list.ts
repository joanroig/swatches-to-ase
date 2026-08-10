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
import {
  animateSortableLayout,
  captureSortableLayout,
  createSortable,
  isSortableClickSuppressed,
  isSortableDragActive,
  runAfterSortableDrag,
} from "../ui/sortable";
import { rgbToHex } from "../utils/color";
import { duplicatePalette } from "./duplicate";
import { openEditorForPalette } from "./editor";
import {
  UNFILED_FOLDER_ID,
  commitRootLibraryOrder,
  deleteFolder,
  getOpenFolderId,
  matchesLibrarySearch,
  movePaletteToFolderIndex,
  openFolder,
  renameFolder,
} from "./folders";
import { folderLibraryKey, paletteLibraryKey, reconcileLibraryOrder } from "./library-order";
import { syncActivePalette } from "./mutations";
import { openViewForPalette, renderViewModal } from "./view";

const PREVIEW_CHIP_LIMIT = 10;

let paletteSortable: ReturnType<typeof createSortable> | null = null;

type CollectionHover = {
  box: HTMLElement;
  intent: "inside" | "before" | "after";
  edge: "top" | "right" | "bottom" | "left" | null;
};

const getGridColumnCount = (grid: HTMLElement) => {
  const columns = window.getComputedStyle(grid).gridTemplateColumns.trim();
  return columns ? columns.split(/\s+/).length : 1;
};

/** Treat the space shared by two neighbouring folders as one canonical insertion seam. */
const getCollectionGapHover = (grid: HTMLElement, x: number, y: number): CollectionHover | null => {
  const items = Array.from(grid.children)
    .filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.matches(".collection-box[data-folder-id], .palette-card[data-palette-id]"),
    )
    .map((element) => ({ element, rect: element.getBoundingClientRect() }));
  const candidates: { hover: CollectionHover; span: number; distance: number }[] = [];

  for (let firstIndex = 0; firstIndex < items.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < items.length; secondIndex += 1) {
      const first = items[firstIndex];
      const second = items[secondIndex];
      if (!first || !second || !first.element.dataset.folderId || !second.element.dataset.folderId) {
        continue;
      }

      const left = first.rect.left <= second.rect.left ? first : second;
      const right = left === first ? second : first;
      const overlapTop = Math.max(left.rect.top, right.rect.top);
      const overlapBottom = Math.min(left.rect.bottom, right.rect.bottom);
      if (overlapBottom > overlapTop && left.rect.right <= x && x <= right.rect.left && overlapTop <= y && y <= overlapBottom) {
        const span = right.rect.left - left.rect.right;
        candidates.push({
          hover: { box: right.element, intent: "before", edge: "left" },
          span,
          distance: Math.abs(x - (left.rect.right + span / 2)),
        });
      }

      const top = first.rect.top <= second.rect.top ? first : second;
      const bottom = top === first ? second : first;
      const overlapLeft = Math.max(top.rect.left, bottom.rect.left);
      const overlapRight = Math.min(top.rect.right, bottom.rect.right);
      if (overlapRight > overlapLeft && top.rect.bottom <= y && y <= bottom.rect.top && overlapLeft <= x && x <= overlapRight) {
        const span = bottom.rect.top - top.rect.bottom;
        candidates.push({
          hover: { box: bottom.element, intent: "before", edge: "top" },
          span,
          distance: Math.abs(y - (top.rect.bottom + span / 2)),
        });
      }
    }
  }

  candidates.sort((a, b) => a.span - b.span || a.distance - b.distance);
  return candidates[0]?.hover ?? null;
};

const getCollectionHover = (x: number, y: number): CollectionHover | null => {
  const under = document.elementFromPoint(x, y);
  const box = under?.closest<HTMLElement>(".collection-box[data-folder-id]") ?? null;
  if (!box) {
    const grid = under?.closest<HTMLElement>(".library-root") ?? null;
    return grid ? getCollectionGapHover(grid, x, y) : null;
  }
  const rect = box.getBoundingClientRect();
  const singleColumn = box.parentElement instanceof HTMLElement && getGridColumnCount(box.parentElement) === 1;
  const edgeX = Math.min(56, rect.width * 0.2);
  const edgeY = Math.min(48, rect.height * 0.2);
  const verticalDistances = [
    { edge: "top" as const, distance: y - rect.top, intent: "before" as const },
    { edge: "bottom" as const, distance: rect.bottom - y, intent: "after" as const },
  ];
  const distances = singleColumn
    ? verticalDistances
    : [
        { edge: "left" as const, distance: x - rect.left, intent: "before" as const },
        { edge: "right" as const, distance: rect.right - x, intent: "after" as const },
        ...verticalDistances,
      ];
  const inCentre =
    (singleColumn || (x >= rect.left + edgeX && x <= rect.right - edgeX)) && y >= rect.top + edgeY && y <= rect.bottom - edgeY;
  if (inCentre) {
    return { box, intent: "inside", edge: null };
  }
  const nearest = distances.reduce((closest, candidate) => (candidate.distance < closest.distance ? candidate : closest));
  return { box, intent: nearest.intent, edge: nearest.edge };
};

let collectionHoverAnchor: { box: HTMLElement; index: number } | null = null;
let collectionInsertArmed = false;

const resolveRootLibraryTarget = ({
  item,
  container,
  items,
  pointerX,
  pointerY,
  currentIndex,
  proposedIndex,
}: Parameters<NonNullable<Parameters<typeof createSortable>[0]["resolveTarget"]>>[0]) => {
  if (!item.dataset.paletteId || !container.classList.contains("library-root")) {
    collectionHoverAnchor = null;
    return proposedIndex;
  }
  const hover = getCollectionHover(pointerX, pointerY);
  if (!hover || !items.includes(hover.box)) {
    collectionHoverAnchor = null;
    const first = Math.min(currentIndex, proposedIndex);
    const last = Math.max(currentIndex, proposedIndex);
    if (items.slice(first, last + 1).some((candidate) => candidate.dataset.folderId)) {
      return currentIndex;
    }
    return proposedIndex;
  }
  if (collectionHoverAnchor?.box !== hover.box) {
    collectionHoverAnchor = { box: hover.box, index: currentIndex };
  }
  if (hover.intent === "inside") {
    return collectionHoverAnchor.index;
  }
  if (!collectionInsertArmed) {
    return collectionHoverAnchor.index;
  }
  const others = items.filter((candidate) => candidate !== item);
  const folderIndex = others.indexOf(hover.box);
  return folderIndex < 0 ? proposedIndex : folderIndex + (hover.intent === "after" ? 1 : 0);
};

const getContainerLibraryOrder = (container: HTMLElement) =>
  Array.from(container.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.matches(LIBRARY_BOX_ITEM_SELECTOR))
    .map(getLibraryBoxKey);

/**
 * Bind the sortable once. It survives every re-render through event delegation on the stable
 * `#palette-list` root.
 */
const ensureSortables = () => {
  if (!paletteList || paletteSortable) {
    return;
  }
  setupCollectionDrops();
  paletteSortable = createSortable({
    root: paletteList,
    itemSelector: ".palette-card[data-palette-id], .collection-box[data-folder-id]",
    // Grip only: the card body is a click target that opens the palette, so dragging from anywhere
    // on it made the two intents easy to confuse.
    handleSelector: ".palette-card-grip",
    // Cards may cross between folder grids, which is how a palette is filed.
    containerSelector: ".palette-grid[data-folder-id]",
    resolveTarget: resolveRootLibraryTarget,
    onDrop: ({ item, fromContainer, toContainer, toIndex }) => {
      const paletteId = item.dataset.paletteId;
      if (!paletteId) {
        if (toContainer.classList.contains("library-root")) {
          commitRootLibraryOrder(getContainerLibraryOrder(toContainer));
        }
        return;
      }
      // Already filed into a collection by the drop handler above; re-filing it here would put it
      // straight back where it came from.
      if (paletteDropHandledExternally === paletteId) {
        paletteDropHandledExternally = null;
        return;
      }
      if (toContainer.classList.contains("library-root")) {
        commitRootLibraryOrder(getContainerLibraryOrder(toContainer));
      } else {
        movePaletteToFolderIndex(paletteId, toContainer.dataset.folderId ?? null, toIndex);
      }
      // The cards are already where they belong, so only the folder chrome needs updating. A full
      // rebuild here would replace the dropped card and cut its settle animation short.
      refreshLibraryChrome();
      updateExportAvailability();
      renderViewModal();
      if (fromContainer !== toContainer) {
        window.setTimeout(renderPaletteList, 240);
      }
    },
  });
};

/*
 * Dropping a palette *onto* a collection.
 *
 * The sortable moves items between containers, which reorders and re-files within a grid — but at
 * the top level a collection is a single box, not a container of cards, so there is no slot to drop
 * into. This watches the pointer for the duration of a drag instead: whichever collection is under
 * it is marked, and releasing there files the palette into that collection.
 *
 * Bound once, on `document`, and it does nothing at all unless a drag is in flight — the sortable
 * flags that on `body`, which is also what opens a collapsed target.
 */
let collectionDropTarget: HTMLElement | null = null;
let collectionInsertTarget: HTMLElement | null = null;
let springOpenTimer: number | null = null;
let edgeInsertTimer: number | null = null;
const SPRING_OPEN_DELAY_MS = 650;
const EDGE_INSERT_DELAY_MS = 500;
/*
 * Set when a collection centre or edge handles a drop, and read by the sortable's own drop handler.
 *
 * Both fire for the same release. The sortable sees the release inside the top-level grid and files
 * the palette back out again, so without this the two handlers fought and the move was undone.
 * This listener is registered first, so the flag is always set before the sortable reads it.
 */
let paletteDropHandledExternally: string | null = null;

const LIBRARY_BOX_ITEM_SELECTOR = ".collection-box[data-folder-id], .palette-card[data-palette-id]";
const LIBRARY_BOX_SELECTOR = ":scope > .collection-box[data-folder-id], :scope > .palette-card[data-palette-id]";

const getLibraryBoxKey = (element: HTMLElement) => {
  const paletteId = element.dataset.paletteId;
  return paletteId ? paletteLibraryKey(paletteId) : folderLibraryKey(element.dataset.folderId ?? "");
};

/** Preserve box identity across the full render needed to update a collection's preview. */
const captureLibraryBoxLayout = () => {
  const grid = paletteList?.querySelector<HTMLElement>(".library-root");
  return captureSortableLayout(grid?.querySelectorAll<HTMLElement>(LIBRARY_BOX_SELECTOR) ?? [], getLibraryBoxKey);
};

const renderWithLibraryBoxAnimation = (before: ReadonlyMap<string, DOMRect>) => {
  renderPaletteList();
  const grid = paletteList?.querySelector<HTMLElement>(".library-root");
  animateSortableLayout(before, grid?.querySelectorAll<HTMLElement>(LIBRARY_BOX_SELECTOR) ?? [], getLibraryBoxKey);
};

const clearSpringOpenTimer = () => {
  if (springOpenTimer !== null) {
    window.clearTimeout(springOpenTimer);
    springOpenTimer = null;
  }
};

const clearEdgeInsertTimer = () => {
  if (edgeInsertTimer !== null) {
    window.clearTimeout(edgeInsertTimer);
    edgeInsertTimer = null;
  }
  collectionInsertArmed = false;
};

const clearCollectionTargets = () => {
  clearSpringOpenTimer();
  clearEdgeInsertTimer();
  collectionDropTarget?.classList.remove("is-drop-target");
  collectionInsertTarget?.classList.remove("is-insert-target");
  collectionInsertTarget?.removeAttribute("data-insert-edge");
  collectionDropTarget = null;
  collectionInsertTarget = null;
};

const scheduleSpringOpen = (target: HTMLElement) => {
  clearSpringOpenTimer();
  springOpenTimer = window.setTimeout(() => {
    springOpenTimer = null;
    if (collectionDropTarget !== target || !document.body.classList.contains("is-dragging")) {
      return;
    }
    const folderId = target.classList.contains("library-crumb") ? null : (target.dataset.folderId ?? null);
    clearCollectionTargets();
    springOpenFolderDuringDrag(folderId);
  }, SPRING_OPEN_DELAY_MS);
};

const scheduleEdgeInsert = (target: HTMLElement, edge: CollectionHover["edge"]) => {
  clearEdgeInsertTimer();
  edgeInsertTimer = window.setTimeout(() => {
    edgeInsertTimer = null;
    if (collectionInsertTarget !== target || target.dataset.insertEdge !== edge) {
      return;
    }
    collectionInsertArmed = true;
    paletteSortable?.refreshTarget();
  }, EDGE_INSERT_DELAY_MS);
};

const markCollectionUnderPointer = (x: number, y: number) => {
  const draggedPalette = document.querySelector(".palette-card.is-sort-dragging[data-palette-id]");
  if (!draggedPalette) {
    clearCollectionTargets();
    return;
  }
  const under = document.elementFromPoint(x, y);
  // The crumb is a target too: inside a collection it is the only way out, since there is no
  // top-level grid on screen to drag back to.
  const crumb = under?.closest<HTMLElement>(".library-crumb") ?? null;
  const hover = crumb ? null : getCollectionHover(x, y);
  const dropTarget = crumb ?? (hover?.intent === "inside" ? hover.box : null);
  const insertTarget = hover && hover.intent !== "inside" ? hover.box : null;
  if (
    dropTarget === collectionDropTarget &&
    insertTarget === collectionInsertTarget &&
    (insertTarget?.dataset.insertEdge ?? null) === (hover?.edge ?? null)
  ) {
    // Spring-loading is a dwell gesture, not simply time spent crossing a target. Restart the
    // countdown while the pointer is still moving, then let the final position arm it.
    if (dropTarget) {
      scheduleSpringOpen(dropTarget);
    }
    if (insertTarget && hover?.edge) {
      scheduleEdgeInsert(insertTarget, hover.edge);
    }
    return;
  }
  clearCollectionTargets();
  collectionDropTarget = dropTarget;
  collectionInsertTarget = insertTarget;
  collectionDropTarget?.classList.add("is-drop-target");
  if (collectionDropTarget) {
    scheduleSpringOpen(collectionDropTarget);
  }
  if (collectionInsertTarget && hover?.edge) {
    collectionInsertTarget.classList.add("is-insert-target");
    collectionInsertTarget.dataset.insertEdge = hover.edge;
    scheduleEdgeInsert(collectionInsertTarget, hover.edge);
  }
};

const setupCollectionDrops = () => {
  document.addEventListener(
    "pointermove",
    (event) => {
      if (!document.body.classList.contains("is-dragging")) {
        return;
      }
      markCollectionUnderPointer(event.clientX, event.clientY);
    },
    { passive: true },
  );

  document.addEventListener("pointerup", (event) => {
    const target = collectionDropTarget;
    const insertTarget = collectionInsertTarget;
    const insertEdge = insertTarget?.dataset.insertEdge ?? null;
    clearCollectionTargets();
    collectionHoverAnchor = null;
    if ((!target && !insertTarget) || !document.body.classList.contains("is-dragging")) {
      return;
    }
    const dragged = document.querySelector<HTMLElement>(".palette-card.is-sort-dragging[data-palette-id]");
    const paletteId = dragged?.dataset.paletteId;
    if (!paletteId) {
      return;
    }
    const previousLayout = captureLibraryBoxLayout();
    paletteDropHandledExternally = paletteId;

    if (target) {
      // No folder id on the crumb: dropping there means the top level. A collection's center is
      // a filing target, so append inside it instead of treating the box as a sortable slot.
      const folderId = target.dataset.folderId ?? null;
      const destination = state.palettes.filter((item) => (item.folderId ?? null) === folderId).length;
      movePaletteToFolderIndex(paletteId, folderId, destination);
    } else if (insertTarget?.parentElement) {
      // Edge releases are explicit insertions even when the pointer is released before the
      // spring-reorder timer has had time to move the live preview.
      const order = getContainerLibraryOrder(insertTarget.parentElement).filter((key) => key !== paletteLibraryKey(paletteId));
      const folderIndex = order.indexOf(getLibraryBoxKey(insertTarget));
      const after = insertEdge === "right" || insertEdge === "bottom";
      order.splice(Math.max(0, folderIndex + (after ? 1 : 0)), 0, paletteLibraryKey(paletteId));
      commitRootLibraryOrder(order);
    }
    // After the sortable has finished its own drop handling, or this render is undone by it. The
    // render refreshes the folder preview; stable data ids let the surviving boxes animate from
    // their old slots even though their DOM nodes were replaced.
    runAfterSortableDrag(() => {
      renderWithLibraryBoxAnimation(previousLayout);
      if (paletteDropHandledExternally === paletteId) {
        paletteDropHandledExternally = null;
      }
    });
    void event;
  });

  document.addEventListener("pointercancel", () => {
    clearCollectionTargets();
    collectionHoverAnchor = null;
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

/*
 * A collection's own controls: rename in place, and delete.
 *
 * Renaming edits the tile's title where it sits rather than through `window.prompt`, which is a
 * no-op in Electron — the desktop build simply could not rename a folder.
 */
const createCollectionActions = (group: LibraryGroup, folder: Folder) => {
  const actions = document.createElement("div");
  actions.className = "palette-actions collection-actions";

  const label = () => actions.closest(".collection-box")?.querySelector<HTMLElement>(".collection-name") ?? null;

  const startRename = () => {
    const title = label();
    if (!title || title.parentElement?.querySelector(".library-group-rename")) {
      return;
    }
    const input = document.createElement("input");
    input.type = "text";
    input.className = "library-group-rename";
    input.value = folder.name;
    input.setAttribute("aria-label", t("folder.rename"));

    let settled = false;
    const finish = (commit: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      if (commit) {
        renameFolder(folder.id, input.value);
      }
      title.textContent = folder.name;
      input.replaceWith(title);
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
    input.addEventListener("blur", () => finish(true));
    input.addEventListener("click", (event) => event.stopPropagation());
    title.replaceWith(input);
    input.focus();
    input.select();
  };

  const renameButton = createIconButton({
    icon: "edit",
    label: t("folder.rename"),
    iconOnly: true,
    onClick: (event) => {
      event.stopPropagation();
      startRename();
    },
  });

  const removeButton = createIconButton({
    icon: "trash",
    label: t("folder.delete"),
    iconOnly: true,
    onClick: (event) => {
      event.stopPropagation();
      if (!window.confirm(t("folder.deleteConfirm", { name: folder.name, count: group.palettes.length }))) {
        return;
      }
      deleteFolder(folder.id);
      renderPaletteList();
    },
  });

  actions.append(renameButton, removeButton);
  return actions;
};

/*
 * A collection: one box, the same size as a palette, holding palettes instead of colors.
 *
 * The library used to stack full-width folder bands, each containing a grid — so a folder and a
 * palette were different kinds of object in different places, and the top level was mostly chrome.
 * Both are boxes in one grid now, the way a phone's home screen holds apps and folders together.
 * What is inside decides what a box shows: a palette shows its colors, a collection shows a
 * preview of the palettes it holds.
 */
const COLLECTION_PREVIEW_LIMIT = 4;

const createCollectionBox = (group: LibraryGroup) => {
  const folder = group.folder;
  if (!folder) {
    return document.createElement("div");
  }

  const box = document.createElement("section");
  box.className = "collection-box";
  box.dataset.folderId = folder.id;

  const header = document.createElement("div");
  header.className = "palette-card-header collection-header";

  const grip = document.createElement("span");
  grip.className = "palette-card-grip library-group-grip";
  grip.setAttribute("role", "button");
  grip.setAttribute("aria-label", t("action.dragToReorder"));
  grip.title = t("action.dragToReorder");
  grip.appendChild(createIcon("grip"));

  const kind = createIcon("folder");
  kind.classList.add("library-group-icon");

  const title = document.createElement("div");
  title.className = "palette-title collection-name";
  title.textContent = folder.name;

  const count = document.createElement("span");
  count.className = "palette-count";
  count.textContent = t("folder.count", { count: group.palettes.length });
  header.append(grip, kind, title, count);

  /*
   * The preview stands in for the box's contents, so it has to be openable: the whole tile is the
   * target, which is how a folder behaves everywhere else.
   */
  const open = document.createElement("button");
  open.type = "button";
  open.className = "collection-preview";
  open.title = t("folder.open");
  open.setAttribute("aria-label", folder.name);

  if (group.palettes.length === 0) {
    const empty = document.createElement("span");
    empty.className = "empty collection-empty";
    empty.textContent = t("folder.empty");
    open.appendChild(empty);
  } else {
    group.palettes.slice(0, COLLECTION_PREVIEW_LIMIT).forEach((palette) => {
      const mini = document.createElement("span");
      mini.className = "collection-mini";
      palette.colors.slice(0, 6).forEach((color) => {
        const chip = document.createElement("span");
        chip.style.background = rgbToHex(color.rgb);
        mini.appendChild(chip);
      });
      open.appendChild(mini);
    });
  }
  open.addEventListener("click", () => {
    if (isSortableClickSuppressed()) {
      return;
    }
    openFolder(folder.id);
    renderPaletteList();
  });

  box.append(header, open, createCollectionActions(group, folder));
  return box;
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
  const dragHint = document.createElement("span");
  dragHint.className = "library-crumb-drag-hint";
  dragHint.textContent = t("folder.dragHomeHint");
  const count = document.createElement("span");
  count.className = "palette-count";
  count.textContent = t("folder.count", { count: group.palettes.length });
  title.append(kind, name, dragHint, count);

  head.append(back, title);
  return head;
};

/** One folder, filling the panel on its own. */
const createFolderView = (group: LibraryGroup, isSearching: boolean) => {
  const section = document.createElement("section");
  /*
   * No `.section-card`, for the same reason the collection tiles dropped it: that class rounds its
   * first header's top corners, and this header is a full-bleed bar across the panel. It was the
   * last place still re-imposing card chrome on something that is not a card.
   */
  section.className = "library-group library-group--open";
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

const renderPaletteListNow = () => {
  if (!paletteList) {
    return;
  }
  // Rebuilding the list replaces the card the pointer is holding, which aborts the drag. Callers
  // are no longer all user-initiated — a cloud sync or the lazily loaded auth state can land at any
  // moment — so the render waits for the drop instead of cancelling it.
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

  const level = openGroup ? "folder" : "library";
  // Read before the write: this is the level we are coming *from*.
  const changed = paletteList.dataset.level !== undefined && paletteList.dataset.level !== level;
  paletteList.dataset.level = level;
  // Folders do not nest, so offering to make one while you are inside one offers something that
  // cannot happen. The toolbar keeps its search.
  createFolderButton?.classList.toggle("is-hidden", Boolean(openGroup));
  if (openGroup) {
    paletteList.appendChild(createFolderView(openGroup, Boolean(query)));
  } else {
    /*
     * One grid of boxes. Collections come first and unfiled palettes follow, which is the only
     * ordering the stored data can express: folders and palettes are two lists, each with its own
     * order, and nothing records how they interleave.
     */
    const grid = document.createElement("div");
    grid.className = "palette-grid library-root";
    // The sentinel marks it as the top level for a drag: a palette dropped here leaves whatever
    // collection it was in.
    grid.dataset.folderId = UNFILED_FOLDER_ID;

    state.libraryOrder = reconcileLibraryOrder(state.libraryOrder, state.palettes, state.folders);
    const groupsById = new Map(allGroups.filter((group) => group.folder).map((group) => [group.id, group]));
    const looseById = new Map(visible.filter((palette) => !palette.folderId).map((palette) => [palette.id, palette]));
    state.libraryOrder.forEach((key) => {
      if (key.startsWith("folder:")) {
        const group = groupsById.get(key.slice("folder:".length));
        if (group && (!query || group.palettes.length > 0)) {
          grid.appendChild(createCollectionBox(group));
        }
        return;
      }
      if (key.startsWith("palette:")) {
        const palette = looseById.get(key.slice("palette:".length));
        if (palette) {
          grid.appendChild(createPaletteCard(palette));
        }
      }
    });

    /*
     * Only when the library is genuinely empty. A search that matches nothing is already reported
     * by `#library-empty-search` above the grid, and saying it again inside a dashed drop zone both
     * repeated the sentence and offered a target for something that does not exist.
     */
    if (grid.children.length === 0 && !query) {
      const empty = document.createElement("p");
      empty.className = "empty library-group-empty";
      empty.textContent = t("folder.emptyOpen");
      grid.appendChild(empty);
    }
    paletteList.appendChild(grid);
  }

  /*
   * A short cross-fade with a nudge in the direction of travel, and only when the level actually
   * changes — the list re-renders on every rename, drop and cloud update, and animating those would
   * leave the panel twitching.
   *
   * This replaced a zoom that grew the opened tile into the screen. It was faithful to what a phone
   * does and it did not look good here: a palette grid is not a sparse field of icons, so the whole
   * view swelling out of one box read as heavy rather than as direct.
   */
  if (changed) {
    paletteList.classList.remove("is-entering-in", "is-entering-out");
    // Forces the removal to land, so stepping between two collections replays the animation.
    void paletteList.offsetWidth;
    paletteList.classList.add(openGroup ? "is-entering-in" : "is-entering-out");
  }

  updateExportAvailability();
  renderViewModal();
  window.dispatchEvent(new Event("actiondock:sync"));
};

export const renderPaletteList = () => {
  // Ordinary renders wait for the drop so they do not replace the node holding pointer state.
  // Spring-loaded navigation uses the preserving path below instead.
  if (isSortableDragActive()) {
    runAfterSortableDrag(renderPaletteList);
    return;
  }
  renderPaletteListNow();
};

/** Switch levels without losing the element and pointer session currently being dragged. */
function springOpenFolderDuringDrag(folderId: string | null) {
  if (!paletteList || !paletteSortable?.isDragging()) {
    return;
  }
  const dragged = paletteList.querySelector<HTMLElement>(".palette-card.is-sort-dragging[data-palette-id]");
  const paletteId = dragged?.dataset.paletteId;
  if (!dragged || !paletteId) {
    return;
  }

  openFolder(folderId);
  renderPaletteListNow();
  const targetId = folderId ?? UNFILED_FOLDER_ID;
  const targetGrid = Array.from(paletteList.querySelectorAll<HTMLElement>(".palette-grid[data-folder-id]")).find(
    (grid) => grid.dataset.folderId === targetId,
  );
  if (!targetGrid) {
    return;
  }
  const replacement = targetGrid.querySelector<HTMLElement>(`.palette-card[data-palette-id="${CSS.escape(paletteId)}"]`);
  if (replacement) {
    replacement.replaceWith(dragged);
  } else {
    targetGrid.querySelector(".library-group-empty")?.remove();
    targetGrid.appendChild(dragged);
  }
  paletteSortable.reconnect(targetGrid);
}
