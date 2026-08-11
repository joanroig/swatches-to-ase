/**
 * A row of controls that keeps as many as fit and puts the rest behind one button.
 *
 * Container queries can hide controls at a breakpoint, but they cannot *move* them, so a
 * CSS-only version is all-or-nothing: either every control is in the row or every control is in the
 * menu, which wastes the space in between. This measures instead, so a card wide enough for four
 * buttons shows four and hides two.
 *
 * Items are given in priority order — the first to be kept, the last to be dropped — and the row is
 * re-divided whenever its width changes.
 */

export type OverflowRowOptions = {
  /** The element whose width decides how much fits. */
  row: HTMLElement;
  /** Holds the items that fit, in priority order. */
  primary: HTMLElement;
  /** Holds the overflow. Hidden by whatever disclosure owns the trigger. */
  menu: HTMLElement;
  /** Shown only while something has overflowed. */
  trigger: HTMLElement;
  /** Optional stable element to observe when moving items changes the row's own width. */
  resizeTarget?: HTMLElement;
  /** Optional width calculation for rows that can reclaim space from a flexible sibling. */
  availableWidth?: () => number;
  /** Called when the trigger is hidden, so an open menu does not stay open with nothing in it. */
  onCollapse?: () => void;
};

/**
 * Widths are read once per layout pass and cached against the item, because an item already moved
 * into the menu reports the menu's layout rather than the row's. The values are fixed-size icon
 * buttons, so one good measurement is as true as the next.
 */
const widthOf = (item: HTMLElement, cache: WeakMap<HTMLElement, number>) => {
  const cached = cache.get(item);
  if (cached !== undefined) {
    return cached;
  }
  const width = item.getBoundingClientRect().width;
  if (width > 0) {
    cache.set(item, width);
  }
  return width;
};

export const createOverflowRow = ({
  row,
  primary,
  menu,
  trigger,
  resizeTarget = row,
  availableWidth = () => row.clientWidth,
  onCollapse,
}: OverflowRowOptions) => {
  const items = [...primary.children].filter((child): child is HTMLElement => child instanceof HTMLElement);
  let widths = new WeakMap<HTMLElement, number>();
  let scheduledFrame = 0;

  row.dataset.overflowReady = "false";

  const apply = (remeasure = false) => {
    if (remeasure) {
      items.forEach((item) => primary.appendChild(item));
      trigger.classList.remove("is-hidden");
      widths = new WeakMap<HTMLElement, number>();
    }
    const available = availableWidth();
    if (available === 0 || items.length === 0) {
      return;
    }
    /*
     * The gap comes from the row, never from `primary`. `primary` is `display: contents` — it lays
     * nothing out, so its own `column-gap` computes to `normal` and reads as zero, which made the
     * row look 50px roomier than it was and nothing ever overflowed.
     */
    const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
    const triggerWidth = widthOf(trigger, widths) + gap;

    // How many fit with nothing hidden, and how many fit once the trigger has taken its place.
    let used = 0;
    let fitsWhole = 0;
    for (const item of items) {
      used += widthOf(item, widths) + (fitsWhole === 0 ? 0 : gap);
      if (used > available) {
        break;
      }
      fitsWhole += 1;
    }

    let keep = items.length;
    if (fitsWhole < items.length) {
      const budget = available - triggerWidth;
      let spent = 0;
      keep = 0;
      for (const item of items) {
        spent += widthOf(item, widths) + (keep === 0 ? 0 : gap);
        if (spent > budget) {
          break;
        }
        keep += 1;
      }
    }

    items.forEach((item, index) => {
      const target = index < keep ? primary : menu;
      if (item.parentElement !== target) {
        target.appendChild(item);
      }
    });

    const overflowed = keep < items.length;
    trigger.classList.toggle("is-hidden", !overflowed);
    if (!overflowed) {
      onCollapse?.();
    }
    row.dataset.overflowReady = "true";
  };

  const schedule = () => {
    if (scheduledFrame) {
      return;
    }
    scheduledFrame = requestAnimationFrame(() => {
      scheduledFrame = 0;
      apply();
    });
  };

  // Moving controls changes layout. Doing that work outside the ResizeObserver callback prevents
  // resize-delivery loops and the one-frame shuffling they cause on narrow rows.
  const observer = new ResizeObserver(schedule);
  observer.observe(resizeTarget);
  apply();

  return {
    refresh: apply,
    destroy: () => {
      observer.disconnect();
      if (scheduledFrame) {
        cancelAnimationFrame(scheduledFrame);
      }
      delete row.dataset.overflowReady;
    },
  };
};
