/**
 * The Discover filter panel: sort, style and color, in one disclosure.
 *
 * Built from script rather than written into the markup because the options *are* the constants in
 * `palette-traits.ts` — twenty-odd rows that must stay in step with the rules that classify a
 * palette. Hand-written markup would let the two drift silently, and a filter offering a style
 * nothing can ever match is worse than no filter.
 */

import { discoverFilterPanel, discoverFilterToggle } from "../dom";
import { t } from "../i18n";
import { discoveryState } from "../state";
import { createIcon } from "../ui/icons";
import { setupPopover } from "../ui/popover";
import { clearDiscoveryFilters, countDiscoveryFilters, setDiscoveryColor, setDiscoverySort, setDiscoveryStyle } from "./discovery";
import { PALETTE_COLORS, PALETTE_STYLES } from "./palette-traits";

/** The swatch beside each color row, so the list can be read at a glance rather than word by word. */
const COLOR_SWATCHES: Record<string, string> = {
  red: "#ef4444",
  orange: "#f97316",
  brown: "#8b5a2b",
  yellow: "#facc15",
  green: "#22c55e",
  turquoise: "#14b8a6",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  pink: "#ec4899",
  grey: "#94a3b8",
  black: "#111827",
  white: "#f8fafc",
};

const SORT_OPTIONS = [
  { value: "recent", key: "discover.sort.recent" },
  { value: "likes-desc", key: "discover.sort.likesDesc" },
  { value: "likes-asc", key: "discover.sort.likesAsc" },
  { value: "saves-desc", key: "discover.sort.savesDesc" },
  { value: "saves-asc", key: "discover.sort.savesAsc" },
];

type Section = {
  titleKey: string;
  /** `null` is the "Any" row, which clears that section. */
  options: { value: string | null; label: string; swatch?: string }[];
  selected: () => string | null;
  select: (value: string | null) => void;
};

const buildSections = (): Section[] => [
  {
    titleKey: "discover.filter.sort",
    options: SORT_OPTIONS.map((option) => ({ value: option.value, label: t(option.key) })),
    selected: () => discoveryState.sort,
    // Sort always has a value, so its rows never clear — falling back to `recent` keeps the feed
    // in a defined order if a row somehow reports null.
    select: (value) => setDiscoverySort(value ?? "recent"),
  },
  {
    titleKey: "discover.filter.style",
    options: [
      { value: null, label: t("discover.filter.any") },
      ...PALETTE_STYLES.map((style) => ({ value: style, label: t(`discover.style.${style}`) })),
    ],
    selected: () => discoveryState.style,
    select: setDiscoveryStyle,
  },
  {
    titleKey: "discover.filter.color",
    options: [
      { value: null, label: t("discover.filter.any") },
      ...PALETTE_COLORS.map((color) => ({ value: color, label: t(`discover.color.${color}`), swatch: COLOR_SWATCHES[color] })),
    ],
    selected: () => discoveryState.color,
    select: setDiscoveryColor,
  },
];

/** Reflects how many filters are on, so the button says something without being opened. */
const syncToggle = () => {
  if (!discoverFilterToggle) {
    return;
  }
  const count = countDiscoveryFilters();
  discoverFilterToggle.classList.toggle("has-filters", count > 0);
  const badge = discoverFilterToggle.querySelector<HTMLElement>(".discover-filter-count");
  if (badge) {
    badge.textContent = count > 0 ? String(count) : "";
  }
};

const render = () => {
  if (!discoverFilterPanel) {
    return;
  }
  discoverFilterPanel.textContent = "";

  const head = document.createElement("div");
  head.className = "discover-filter-head";
  const title = document.createElement("span");
  title.className = "discover-filter-title";
  title.textContent = t("discover.filter.title");
  head.append(title);

  if (countDiscoveryFilters() > 0) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "text-link discover-filter-clear";
    clear.textContent = t("discover.filter.clear");
    clear.addEventListener("click", (event) => {
      event.stopPropagation();
      clearDiscoveryFilters();
      render();
      syncToggle();
    });
    head.append(clear);
  }
  discoverFilterPanel.append(head);

  buildSections().forEach((section) => {
    const group = document.createElement("div");
    group.className = "discover-filter-group";
    group.setAttribute("role", "group");

    const label = document.createElement("p");
    label.className = "discover-filter-label";
    label.textContent = t(section.titleKey);
    group.append(label);

    section.options.forEach((option) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "discover-filter-option";
      const isSelected = section.selected() === option.value;
      row.classList.toggle("is-selected", isSelected);
      row.setAttribute("aria-pressed", isSelected ? "true" : "false");

      if (option.swatch) {
        const dot = document.createElement("span");
        dot.className = "discover-filter-swatch";
        dot.style.background = option.swatch;
        row.append(dot);
      }
      const text = document.createElement("span");
      text.className = "discover-filter-option-label";
      text.textContent = option.label;
      row.append(text);

      if (isSelected) {
        const tick = createIcon("check");
        tick.classList.add("discover-filter-tick");
        row.append(tick);
      }

      row.addEventListener("click", (event) => {
        event.stopPropagation();
        // A second click on the current value clears it, which is how a single-select list lets you
        // get back to "any" without hunting for the row that says so.
        section.select(isSelected ? null : option.value);
        render();
        syncToggle();
      });
      group.append(row);
    });
    discoverFilterPanel.append(group);
  });
};

export const setupDiscoveryFilters = () => {
  if (!discoverFilterToggle || !discoverFilterPanel) {
    return;
  }
  const root = discoverFilterToggle.closest<HTMLElement>(".discover-filter") ?? discoverFilterPanel.parentElement;
  if (root) {
    // Not `closeOnPanelClick`: choosing a style and then a color is one trip to this panel, and
    // closing on the first pick would make the second a second trip.
    setupPopover({ root, trigger: discoverFilterToggle, panel: discoverFilterPanel, closeOnPanelClick: false });
  }
  render();
  syncToggle();
};

/** Rebuilds the labels after a language change, keeping the current selection. */
export const refreshDiscoveryFilters = () => {
  render();
  syncToggle();
};
