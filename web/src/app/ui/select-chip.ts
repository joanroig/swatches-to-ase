import { onLanguageChange } from "../i18n";

/**
 * A chip that opens a styled list of options.
 *
 * Replaces a native `<select>` on the toolbars. Two reasons it is worth the component: a native
 * select is always as wide as its *longest* option, so a short value like "Neutral" sat in a box
 * sized for "Popularity (high to low)"; and its dropdown is drawn by the operating system, so it
 * ignores the app's theme entirely and looked pasted on.
 *
 * The options still come from a real `<select>` in the markup — it stays as the single source of
 * truth for the values, the current selection and the translated labels, and it keeps working if
 * this never runs. It is hidden from view and from assistive tech; the chip carries the listbox
 * semantics.
 */

export type SelectChip = { refresh: () => void; close: () => void };

const OPEN_CLASS = "is-open";

const optionLabel = (option: HTMLOptionElement) => option.textContent?.trim() ?? option.value;

export const createSelectChip = (select: HTMLSelectElement | null): SelectChip | null => {
  const chip = select?.closest<HTMLElement>(".chip--select");
  const group = select?.closest<HTMLElement>(".chip-group");
  if (!select || !chip || !group) {
    return null;
  }

  // The native control stays in the DOM as the value store, but out of the accessibility tree:
  // the chip below announces the same thing, and two listboxes for one value is worse than none.
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "chip-select-label";

  const list = document.createElement("div");
  list.className = "chip-select-list";
  list.setAttribute("role", "listbox");

  chip.appendChild(label);
  // The list is a sibling of the chip, not a child: as a child, a click on an option bubbled back
  // through the chip's own toggle and reopened the list the moment it closed.
  group.appendChild(list);
  chip.tabIndex = 0;
  chip.setAttribute("role", "combobox");
  chip.setAttribute("aria-haspopup", "listbox");
  chip.setAttribute("aria-expanded", "false");

  const close = () => {
    if (!group.classList.contains(OPEN_CLASS)) {
      return;
    }
    group.classList.remove(OPEN_CLASS);
    chip.setAttribute("aria-expanded", "false");
  };

  const open = () => {
    group.classList.add(OPEN_CLASS);
    chip.setAttribute("aria-expanded", "true");
    list.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  };

  const choose = (value: string) => {
    if (select.value !== value) {
      select.value = value;
      // `change` does not fire for programmatic assignment, and every consumer listens for it.
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close();
    chip.focus();
  };

  const refresh = () => {
    label.textContent = optionLabel(select.selectedOptions[0] ?? select.options[0]);
    chip.setAttribute("aria-label", `${select.getAttribute("aria-label") ?? ""} ${label.textContent}`.trim());
    list.textContent = "";
    Array.from(select.options).forEach((option) => {
      const entry = document.createElement("button");
      entry.type = "button";
      entry.className = "chip-select-option";
      entry.setAttribute("role", "option");
      entry.setAttribute("aria-selected", option.selected ? "true" : "false");
      entry.dataset.value = option.value;
      entry.textContent = optionLabel(option);
      entry.addEventListener("click", () => choose(option.value));
      list.appendChild(entry);
    });
  };

  const step = (direction: 1 | -1) => {
    const options = Array.from(select.options);
    const next = options[Math.max(0, Math.min(select.selectedIndex + direction, options.length - 1))];
    if (next) {
      choose(next.value);
    }
  };

  chip.addEventListener("click", (event) => {
    event.stopPropagation();
    if (group.classList.contains(OPEN_CLASS)) {
      close();
    } else {
      open();
    }
  });

  chip.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (group.classList.contains(OPEN_CLASS)) {
          close();
        }
        step(event.key === "ArrowDown" ? 1 : -1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (group.classList.contains(OPEN_CLASS)) {
          close();
        } else {
          open();
        }
        break;
      case "Escape":
        close();
        break;
      default:
        break;
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target instanceof Node && group.contains(event.target)) {
      return;
    }
    close();
  });

  select.addEventListener("change", refresh);
  // Translations rewrite the option text in place, so the chip has to be rebuilt with them.
  onLanguageChange(refresh);
  refresh();

  return { refresh, close };
};
