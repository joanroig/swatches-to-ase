/**
 * A minimal disclosure popover: a trigger button that shows a panel, closing on outside click,
 * Escape, or a click on anything inside the panel that performs an action.
 *
 * The panel is a plain element that is laid out inline at wide widths and only becomes a floating
 * panel through CSS at narrow widths, so nothing is duplicated between the two presentations.
 */
export type PopoverOptions = {
  root: HTMLElement;
  trigger: HTMLElement | null;
  panel: HTMLElement | null;
  /** Close after any click inside the panel. Defaults to true. */
  closeOnPanelClick?: boolean;
};

const OPEN_CLASS = "is-open";

export const setupPopover = ({ root, trigger, panel, closeOnPanelClick = true }: PopoverOptions) => {
  if (!trigger || !panel) {
    return { close: () => undefined };
  }

  const close = () => {
    if (!root.classList.contains(OPEN_CLASS)) {
      return;
    }
    root.classList.remove(OPEN_CLASS);
    trigger.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    root.classList.add(OPEN_CLASS);
    trigger.setAttribute("aria-expanded", "true");
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (root.classList.contains(OPEN_CLASS)) {
      close();
    } else {
      open();
    }
  });

  if (closeOnPanelClick) {
    panel.addEventListener("click", (event) => {
      // A select needs to stay open long enough to choose an option.
      if (event.target instanceof HTMLSelectElement) {
        return;
      }
      close();
    });
  }

  document.addEventListener("click", (event) => {
    if (event.target instanceof Node && root.contains(event.target)) {
      return;
    }
    close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
    }
  });

  return { close };
};
