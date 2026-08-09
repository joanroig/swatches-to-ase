/**
 * The single pointer-driven sortable used by every reorderable list in the app.
 *
 * Design notes — these are the reasons the previous per-list implementations misbehaved:
 *
 * - The dragged element never leaves its slot. It is translated, not re-parented, so the container
 *   keeps exactly the same number of grid tracks and no sibling changes size. Layout-scoped
 *   descendant selectors (`#palette-editor[data-layout="vertical"] .color-row`) keep matching.
 * - The insertion index is a pure function of the current pointer position measured against a
 *   layout snapshot. It never depends on pointer velocity or on how many pointermove events fired,
 *   so a drag cannot walk past its target and it always lands where it was released.
 * - Displaced siblings are animated with FLIP. Hit testing reads the snapshot rather than
 *   `getBoundingClientRect()`, so an in-flight animation can never feed back into the index.
 * - State is mutated once, on drop.
 */

export type SortableOptions = {
  /** Stable delegation root. Items may be re-rendered underneath it at will. */
  root: HTMLElement;
  /** Selector identifying a sortable item inside the root. */
  itemSelector: string;
  /** When set, a drag may only start from inside this selector, and starts without a long press. */
  handleSelector?: string;
  /** Extra selector that never starts a drag (ignored when `handleSelector` is set). */
  cancelSelector?: string;
  /**
   * When set, items may be dragged between any element under `root` matching this selector, which
   * is how a palette moves from one folder to another.
   */
  containerSelector?: string;
  /** Long-press delay before a handle-less touch drag begins. */
  holdDelayMs?: number;
  /** Pointer travel needed before a mouse/pen drag begins. */
  thresholdPx?: number;
  /** FLIP duration for displaced siblings. Set to 0 to disable. */
  animationMs?: number;
  /** Duration of the settle animation that eases the dropped item into its slot. */
  dropAnimationMs?: number;
  /** Called once, on drop, and only when the position actually changed. */
  onDrop: (change: SortableChange) => void;
};

export type SortableChange = {
  item: HTMLElement;
  fromContainer: HTMLElement;
  toContainer: HTMLElement;
  fromIndex: number;
  toIndex: number;
};

/** A container-relative layout box, immune to FLIP transforms. */
type Slot = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const DEFAULT_HOLD_DELAY_MS = 220;
const DEFAULT_THRESHOLD_PX = 5;
const DEFAULT_ANIMATION_MS = 170;
const DEFAULT_DROP_ANIMATION_MS = 220;
const DROP_EASING = "cubic-bezier(0.2, 0.9, 0.25, 1)";
const CLICK_SUPPRESSION_MS = 300;
const AUTOSCROLL_EDGE_PX = 64;
const AUTOSCROLL_MAX_SPEED_PX = 18;
const INTERACTIVE_SELECTOR = "button, input, select, textarea, a, label, [contenteditable='true']";

export const SORTABLE_ITEM_CLASS = "is-sort-dragging";
export const SORTABLE_CONTAINER_CLASS = "is-sorting";

let suppressClickUntil = 0;
let activeDragCount = 0;
const dragEndListeners = new Set<() => void>();

/** True while a click should be swallowed because it is the tail end of a drag. */
export const isSortableClickSuppressed = () => Date.now() < suppressClickUntil;

/**
 * Whether any sortable anywhere is mid-drag.
 *
 * A full re-render replaces the very node the pointer is holding, which silently aborts the drag.
 * Anything that can re-render a sortable list on a timer or a network callback — the cloud layer
 * settling, a sync landing — has to check this first. See `runAfterSortableDrag`.
 */
export const isSortableDragActive = () => activeDragCount > 0;

/** Run `task` now, or once the in-flight drag has finished if there is one. */
export const runAfterSortableDrag = (task: () => void) => {
  if (activeDragCount === 0) {
    task();
    return;
  }
  dragEndListeners.add(task);
};

const notifyDragEnd = () => {
  if (activeDragCount > 0 || dragEndListeners.size === 0) {
    return;
  }
  const pending = [...dragEndListeners];
  dragEndListeners.clear();
  pending.forEach((task) => {
    task();
  });
};

/** Mirrors the app's motion preference so drags stay still for users who asked for that. */
const prefersReducedMotion = () => {
  const motion = document.body.dataset.motion;
  if (motion === "off") {
    return true;
  }
  if (motion === "on") {
    return false;
  }
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
};

const getScrollParent = (element: HTMLElement): HTMLElement | null => {
  let node = element.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

export const createSortable = (options: SortableOptions) => {
  const {
    root,
    itemSelector,
    handleSelector,
    cancelSelector,
    holdDelayMs = DEFAULT_HOLD_DELAY_MS,
    thresholdPx = DEFAULT_THRESHOLD_PX,
    containerSelector,
    animationMs: reorderAnimationMs = DEFAULT_ANIMATION_MS,
    dropAnimationMs: settleAnimationMs = DEFAULT_DROP_ANIMATION_MS,
    onDrop,
  } = options;

  const animationMs = () => (prefersReducedMotion() ? 0 : reorderAnimationMs);
  const dropAnimationMs = () => (prefersReducedMotion() ? 0 : settleAnimationMs);

  let pointerId: number | null = null;
  let container: HTMLElement | null = null;
  let item: HTMLElement | null = null;
  let items: HTMLElement[] = [];
  let slots: Slot[] = [];
  let fromIndex = -1;
  let currentIndex = -1;
  let fromContainer: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let grabOffsetX = 0;
  let grabOffsetY = 0;
  let translateX = 0;
  let translateY = 0;
  let originLeft = 0;
  let originTop = 0;
  let isDragging = false;
  let holdElapsed = false;
  let holdTimerId: number | null = null;
  let scrollParent: HTMLElement | null = null;
  let autoscrollFrame = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;

  const getItems = (parent: HTMLElement) =>
    Array.from(parent.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.matches(itemSelector));

  const clearHoldTimer = () => {
    if (holdTimerId !== null) {
      window.clearTimeout(holdTimerId);
      holdTimerId = null;
    }
  };

  /**
   * Map a viewport point into the container's untransformed layout space, which is the space the
   * slot rectangles live in.
   */
  const toLocalPoint = (pointerX: number, pointerY: number) => {
    const rect = container!.getBoundingClientRect();
    const scaleX = container!.offsetWidth > 0 ? rect.width / container!.offsetWidth : 1;
    const scaleY = container!.offsetHeight > 0 ? rect.height / container!.offsetHeight : 1;
    return {
      x: (pointerX - rect.left) / (scaleX || 1),
      y: (pointerY - rect.top) / (scaleY || 1),
      rect,
      scaleX: scaleX || 1,
      scaleY: scaleY || 1,
    };
  };

  /** The container-relative origin that `offsetLeft`/`offsetTop` on the items are measured from. */
  const measureOrigin = () => {
    if (!container) {
      return;
    }
    // When the container is itself positioned it *is* the items' offsetParent, so their offsets
    // are already container-relative.
    const isOffsetParent = getComputedStyle(container).position !== "static";
    originLeft = isOffsetParent ? 0 : container.offsetLeft;
    originTop = isOffsetParent ? 0 : container.offsetTop;
  };

  /**
   * Capture the list's slot geometry once, at drag start.
   *
   * Two deliberate choices here, both of which were bugs before:
   *
   * 1. `offset*`, not `getBoundingClientRect()`. Displaced siblings are mid-FLIP, so their client
   *    rects carry an animation transform.
   * 2. Measured once and then frozen. The slot rectangles are a property of the list, not of which
   *    item currently sits in each one, so freezing them keeps the hit test a pure function of the
   *    pointer. Re-deriving them from the live DOM after every reorder is what let the index feed
   *    back into itself.
   */
  const measureSlots = () => {
    if (!container) {
      return;
    }
    measureOrigin();
    slots = items.map((element) => ({
      left: element.offsetLeft - originLeft,
      top: element.offsetTop - originTop,
      width: element.offsetWidth,
      height: element.offsetHeight,
    }));
  };

  /**
   * Glue the dragged item to the pointer.
   *
   * The clamp is against the whole delegation root when items may cross containers, not against
   * the container they started in. Clamping per container made a cross-folder drag feel stuck: the
   * card refused to leave its own folder until the pointer had already arrived in the next one.
   */
  const applyTranslate = (pointerX: number, pointerY: number) => {
    if (!container || !item) {
      return;
    }
    const { scaleX, scaleY } = toLocalPoint(pointerX, pointerY);
    const containerRect = container.getBoundingClientRect();
    const bounds = (containerSelector ? root : container).getBoundingClientRect();
    const width = item.offsetWidth * scaleX;
    const height = item.offsetHeight * scaleY;

    const maxLeft = bounds.right - width;
    const maxTop = bounds.bottom - height;
    const desiredLeft = pointerX - grabOffsetX;
    const desiredTop = pointerY - grabOffsetY;
    const nextLeft = maxLeft >= bounds.left ? Math.min(Math.max(desiredLeft, bounds.left), maxLeft) : bounds.left;
    const nextTop = maxTop >= bounds.top ? Math.min(Math.max(desiredTop, bounds.top), maxTop) : bounds.top;

    // Where the item's own layout box currently sits, in viewport coordinates.
    const layoutLeft = containerRect.left + (item.offsetLeft - originLeft) * scaleX;
    const layoutTop = containerRect.top + (item.offsetTop - originTop) * scaleY;

    translateX = (nextLeft - layoutLeft) / scaleX;
    translateY = (nextTop - layoutTop) / scaleY;
    item.style.transform = `translate(${translateX}px, ${translateY}px)`;
  };

  /** True when the pointer is over the container the item currently belongs to. */
  const isPointerOverContainer = (pointerX: number, pointerY: number) => {
    if (!container) {
      return false;
    }
    const rect = container.getBoundingClientRect();
    return pointerX >= rect.left && pointerX <= rect.right && pointerY >= rect.top && pointerY <= rect.bottom;
  };

  /**
   * Resolve the index the dragged item should occupy for a pointer at (x, y).
   *
   * Depends only on the pointer and the frozen slot table — never on where the item currently is.
   * That is what makes it stable: a stationary pointer always resolves to the same index, so the
   * list settles instead of ping-ponging between two orders.
   */
  const resolveTargetIndex = (pointerX: number, pointerY: number) => {
    if (!container || slots.length === 0) {
      return currentIndex;
    }
    const { x: localX, y: localY } = toLocalPoint(pointerX, pointerY);

    // A slot the pointer is actually inside wins outright.
    const contained = slots.findIndex(
      (slot) => localX >= slot.left && localX <= slot.left + slot.width && localY >= slot.top && localY <= slot.top + slot.height,
    );
    if (contained >= 0) {
      return contained;
    }

    // Otherwise fall back to the closest slot centre, which covers the gaps between slots and any
    // pointer position outside the container.
    let nearest = currentIndex;
    let nearestDistance = Number.POSITIVE_INFINITY;
    slots.forEach((slot, index) => {
      const deltaX = localX - (slot.left + slot.width / 2);
      const deltaY = localY - (slot.top + slot.height / 2);
      const distance = deltaX * deltaX + deltaY * deltaY;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    });
    return nearest;
  };

  const moveItemTo = (nextIndex: number) => {
    if (!container || !item || nextIndex === currentIndex) {
      return;
    }
    const before = new Map<HTMLElement, DOMRect>();
    items.forEach((element) => {
      if (element !== item) {
        before.set(element, element.getBoundingClientRect());
      }
    });

    const others = items.filter((element) => element !== item);
    const reference = others[nextIndex];
    if (reference) {
      container.insertBefore(item, reference);
    } else {
      const last = others[others.length - 1];
      container.insertBefore(item, last ? last.nextSibling : null);
    }

    items = getItems(container);
    currentIndex = items.indexOf(item);
    // The slot table is deliberately *not* refreshed here — see `measureSlots`.

    const flipMs = animationMs();
    if (flipMs <= 0) {
      return;
    }
    items.forEach((element) => {
      if (element === item) {
        return;
      }
      const previous = before.get(element);
      if (!previous) {
        return;
      }
      const current = element.getBoundingClientRect();
      const deltaX = previous.left - current.left;
      const deltaY = previous.top - current.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
        return;
      }
      element.getAnimations().forEach((animation) => animation.cancel());
      element.animate([{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }], {
        duration: flipMs,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
    });
  };

  /**
   * Re-home the dragged item when the pointer is over a different container of the same group.
   * The frozen-slot invariant is per container, so the table is re-measured on the way in.
   */
  const syncContainerUnderPointer = (pointerX: number, pointerY: number) => {
    if (!containerSelector || !item || !container) {
      return false;
    }
    // The dragged item has `pointer-events: none`, so this never hits the item itself.
    const under = document.elementFromPoint(pointerX, pointerY);
    const nextContainer = under instanceof Element ? under.closest<HTMLElement>(containerSelector) : null;
    if (!nextContainer || nextContainer === container || !root.contains(nextContainer)) {
      return false;
    }

    container.classList.remove(SORTABLE_CONTAINER_CLASS);
    const target = getItems(nextContainer);
    // Drop in at the end for now; the normal hit test refines it on the same frame.
    const last = target[target.length - 1];
    if (last) {
      nextContainer.insertBefore(item, last.nextSibling);
    } else {
      nextContainer.appendChild(item);
    }
    container = nextContainer;
    container.classList.add(SORTABLE_CONTAINER_CLASS);
    items = getItems(container);
    currentIndex = items.indexOf(item);
    measureSlots();
    scrollParent = getScrollParent(container);
    return true;
  };

  const stopAutoscroll = () => {
    if (autoscrollFrame) {
      window.cancelAnimationFrame(autoscrollFrame);
      autoscrollFrame = 0;
    }
  };

  const stepAutoscroll = () => {
    autoscrollFrame = 0;
    if (!isDragging) {
      return;
    }
    const viewportTop = scrollParent ? scrollParent.getBoundingClientRect().top : 0;
    const viewportHeight = scrollParent ? scrollParent.clientHeight : window.innerHeight;
    const offset = lastPointerY - viewportTop;
    let delta = 0;
    if (offset < AUTOSCROLL_EDGE_PX) {
      delta = -((AUTOSCROLL_EDGE_PX - offset) / AUTOSCROLL_EDGE_PX) * AUTOSCROLL_MAX_SPEED_PX;
    } else if (offset > viewportHeight - AUTOSCROLL_EDGE_PX) {
      delta = ((offset - (viewportHeight - AUTOSCROLL_EDGE_PX)) / AUTOSCROLL_EDGE_PX) * AUTOSCROLL_MAX_SPEED_PX;
    }
    if (delta !== 0) {
      if (scrollParent) {
        scrollParent.scrollTop += delta;
      } else {
        window.scrollBy(0, delta);
      }
      moveItemTo(resolveTargetIndex(lastPointerX, lastPointerY));
      applyTranslate(lastPointerX, lastPointerY);
    }
    autoscrollFrame = window.requestAnimationFrame(stepAutoscroll);
  };

  const beginDrag = () => {
    if (isDragging || !container || !item) {
      return;
    }
    isDragging = true;
    activeDragCount += 1;
    clearHoldTimer();
    translateX = 0;
    translateY = 0;
    measureSlots();
    item.classList.add(SORTABLE_ITEM_CLASS);
    container.classList.add(SORTABLE_CONTAINER_CLASS);
    // A page-level flag, so anything that has folded itself shut can open enough to be a drop
    // target while a drag is in the air. A collapsed folder is zero pixels tall and cannot be
    // dropped into otherwise.
    document.body.classList.add("is-dragging");
    scrollParent = getScrollParent(container);
    stopAutoscroll();
    autoscrollFrame = window.requestAnimationFrame(stepAutoscroll);
  };

  function preventTouchScroll(event: TouchEvent) {
    if (isDragging) {
      event.preventDefault();
    }
  }

  const detachListeners = () => {
    clearHoldTimer();
    stopAutoscroll();
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerUp);
    window.removeEventListener("touchmove", preventTouchScroll);
  };

  const clearSession = () => {
    if (isDragging) {
      activeDragCount = Math.max(0, activeDragCount - 1);
    }
    pointerId = null;
    container = null;
    item = null;
    items = [];
    slots = [];
    fromIndex = -1;
    currentIndex = -1;
    fromContainer = null;
    isDragging = false;
    holdElapsed = false;
    scrollParent = null;
    translateX = 0;
    translateY = 0;
    // A microtask, not a direct call: the drop path clears the session *before* it invokes
    // `onDrop`, and a deferred render must not replace the dropped node out from under it.
    queueMicrotask(notifyDragEnd);
  };

  const detach = () => {
    detachListeners();
    if (item) {
      document.body.classList.remove("is-dragging");
      item.classList.remove(SORTABLE_ITEM_CLASS);
      item.style.transform = "";
    }
    container?.classList.remove(SORTABLE_CONTAINER_CLASS);
    clearSession();
  };

  function handlePointerMove(event: PointerEvent) {
    if (pointerId !== event.pointerId || !item || !container) {
      return;
    }
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;

    if (!isDragging) {
      const travelled = Math.hypot(event.clientX - startX, event.clientY - startY);
      const needsLongPress = !handleSelector && event.pointerType === "touch";
      if (needsLongPress && !holdElapsed) {
        // Moving before the long press completes means the user is scrolling, not dragging.
        if (travelled >= thresholdPx) {
          detach();
        }
        return;
      }
      if (travelled < thresholdPx) {
        return;
      }
      beginDrag();
    }

    event.preventDefault();
    syncContainerUnderPointer(event.clientX, event.clientY);
    // While the pointer is in the space between containers, hold the current position rather than
    // shuffling the old container around; otherwise the hand-off looks jumpy.
    if (!containerSelector || isPointerOverContainer(event.clientX, event.clientY)) {
      moveItemTo(resolveTargetIndex(event.clientX, event.clientY));
    }
    applyTranslate(event.clientX, event.clientY);
  }

  function handlePointerUp(event: PointerEvent) {
    if (pointerId !== event.pointerId) {
      return;
    }
    const didDrag = isDragging;
    const from = fromIndex;
    const to = currentIndex;
    const dragged = item;
    const draggedContainer = container;
    const originContainer = fromContainer;
    const settleX = translateX;
    const settleY = translateY;

    if (dragged) {
      try {
        dragged.releasePointerCapture(event.pointerId);
      } catch {
        // The element may already be detached.
      }
    }

    if (!didDrag) {
      detach();
      return;
    }

    detachListeners();
    clearSession();
    suppressClickUntil = Date.now() + CLICK_SUPPRESSION_MS;

    document.body.classList.remove("is-dragging");
    dragged?.classList.remove(SORTABLE_ITEM_CLASS);
    draggedContainer?.classList.remove(SORTABLE_CONTAINER_CLASS);
    originContainer?.classList.remove(SORTABLE_CONTAINER_CLASS);

    // Commit synchronously, before any animation. Deferring the callback until the settle finished
    // meant a reload during those few hundred milliseconds silently lost the reorder.
    const movedContainer = Boolean(originContainer && draggedContainer && originContainer !== draggedContainer);
    if (dragged && originContainer && draggedContainer && from >= 0 && to >= 0 && (movedContainer || from !== to)) {
      onDrop({ item: dragged, fromContainer: originContainer, toContainer: draggedContainer, fromIndex: from, toIndex: to });
    }

    const settleMs = dropAnimationMs();
    const distance = Math.hypot(settleX, settleY);
    // A callback that re-rendered has replaced the node, and there is nothing left to ease in.
    if (!dragged || !dragged.isConnected || settleMs <= 0 || distance < 1) {
      if (dragged) {
        dragged.style.transform = "";
      }
      return;
    }

    // Ease the dropped item from where the pointer left it into its slot. The inline transform is
    // cleared first so that when the animation finishes the element simply keeps its resting
    // position instead of snapping back to the drag offset for a frame.
    dragged.style.transform = "";
    dragged.getAnimations().forEach((animation) => animation.cancel());
    dragged.animate([{ transform: `translate(${settleX}px, ${settleY}px)` }, { transform: "translate(0, 0)" }], {
      duration: settleMs,
      easing: DROP_EASING,
    });
  }

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || pointerId !== null) {
      return;
    }
    // Not `HTMLElement`: icons are inline SVG, and `SVGElement` does not extend `HTMLElement`.
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }
    const candidate = target.closest<HTMLElement>(itemSelector);
    if (!candidate || !root.contains(candidate)) {
      return;
    }
    if (handleSelector) {
      if (!target.closest(handleSelector)) {
        return;
      }
    } else if (target.closest(INTERACTIVE_SELECTOR) || (cancelSelector && target.closest(cancelSelector))) {
      return;
    }

    const parent = candidate.parentElement;
    if (!parent) {
      return;
    }
    const siblings = getItems(parent);
    // A lone item is still draggable when it can be moved to another container.
    if (siblings.length < 2 && !containerSelector) {
      return;
    }

    pointerId = event.pointerId;
    container = parent;
    fromContainer = parent;
    item = candidate;
    items = siblings;
    fromIndex = siblings.indexOf(candidate);
    currentIndex = fromIndex;
    startX = event.clientX;
    startY = event.clientY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    const rect = candidate.getBoundingClientRect();
    grabOffsetX = event.clientX - rect.left;
    grabOffsetY = event.clientY - rect.top;
    isDragging = false;
    holdElapsed = false;

    if (handleSelector) {
      // Handles are explicit affordances, so no long press is needed on any pointer type.
      event.preventDefault();
    } else {
      clearHoldTimer();
      holdTimerId = window.setTimeout(() => {
        holdTimerId = null;
        holdElapsed = true;
        if (pointerId === null || isDragging || event.pointerType !== "touch") {
          return;
        }
        beginDrag();
        applyTranslate(lastPointerX, lastPointerY);
      }, holdDelayMs);
    }

    try {
      candidate.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in some embedded contexts; the window listeners cover us.
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("touchmove", preventTouchScroll, { passive: false });
  };

  root.addEventListener("pointerdown", handlePointerDown);

  return {
    destroy: () => {
      detach();
      root.removeEventListener("pointerdown", handlePointerDown);
    },
    isDragging: () => isDragging,
  };
};
