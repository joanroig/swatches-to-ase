import { setButtonContent, type IconName } from "./icons";

/**
 * Builders for the buttons the app creates from script.
 *
 * The same eight lines — create, set `type`, set a class, fill with an icon and a label, mirror the
 * label into `title` and `aria-label`, attach the handler — were written out at two dozen call
 * sites, and they had drifted: some set `aria-label` only when icon-only, some forgot `type` and
 * submitted the enclosing form, some had no accessible name at all.
 */

export type IconButtonOptions = {
  icon: IconName;
  /** Used as the visible label when not icon-only, and always as the tooltip and accessible name. */
  label: string;
  /** Optional: a disclosure trigger gets its behaviour from the popover that owns it. */
  onClick?: (event: MouseEvent) => void;
  /** Show the icon alone. The label still reaches assistive tech through `aria-label`. */
  iconOnly?: boolean;
  className?: string;
  /** A stable, translation-independent hook for tests and delegated handlers. */
  actionKey?: string;
};

export const createIconButton = ({ icon, label, onClick, iconOnly = false, className = "ghost", actionKey }: IconButtonOptions) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  if (actionKey) {
    button.dataset.actionKey = actionKey;
  }
  setButtonContent(button, icon, label, iconOnly);
  // On an icon-only button `setButtonContent` already sets both; setting them here too keeps a
  // labelled button reachable by its name when the visible text is truncated.
  button.setAttribute("aria-label", label);
  button.title = label;
  if (onClick) {
    button.addEventListener("click", onClick);
  }
  return button;
};

/** A plain button with text, for the handful of places that need no icon. */
export const createTextButton = (label: string, onClick: (event: MouseEvent) => void, className = "ghost") => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
};
