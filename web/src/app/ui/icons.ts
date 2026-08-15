/*
 * One sprite, bundled, instead of 54 files on the network.
 *
 * Every icon used to be its own file referenced as `<use href="icons/settings.svg#icon">`, and an
 * external `<use>` is a fetch: a cold load asked for 42 of them and the last one landed two seconds
 * in, so the app came up with a grid of empty squares that filled in one by one. A reload asked for
 * all 42 again to revalidate, which is why refreshing was the worst case.
 *
 * The files are still one-per-icon on disk — that is the sane way to edit them — but they are read
 * at build time and stamped into a single inline sprite, so `<use href="#icon-settings">` resolves
 * inside the document and nothing is requested at all.
 */
const iconSources = import.meta.glob("../../icons/*.svg", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

/*
 * The names the app may ask for. The sprite carries whatever is in the folder; this list is what the
 * type system enforces, so a typo at a call site is a compile error rather than an empty box.
 */
const ICON_NAMES = [
  "settings",
  "import",
  "generate",
  "export",
  "view",
  "edit",
  "trash",
  "plus",
  "download",
  "files",
  "library",
  "duplicate",
  "rows",
  "columns",
  "eyedropper",
  "chevronUp",
  "chevronDown",
  "chevronLeft",
  "check",
  "grip",
  "link",
  "share",
  "pdf",
  "image",
  "css",
  "svg",
  "code",
  "tailwind",
  "embed",
  "x",
  "pinterest",
  "coolors",
  "globe",
  "heart",
  "bookmark",
  "refresh",
  "login",
  "logout",
  "cloud",
  "more",
  "undo",
  "redo",
  "playground",
  "lock",
  "minus",
  "folder",
  "folderPlus",
  "sort",
  "inbox",
  "expand",
  "collapse",
  "unlock",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** The id a given icon takes inside the sprite. Also what the markup's static `<use>` tags name. */
export const iconHref = (name: string) => `#icon-${name}`;

const SPRITE_ID = "icon-sprite";

/*
 * Each source file is `<svg viewBox="0 0 24 24"><g id="icon">…</g></svg>`. The `<g>` carries the
 * stroke and fill the icon was drawn with, so it is kept whole; only its id goes, because 54 copies
 * of `id="icon"` in one document is 53 too many.
 */
const buildSymbols = () =>
  Object.entries(iconSources)
    .map(([path, source]) => {
      const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.svg$/, "");
      const openTagEnd = source.indexOf(">", source.indexOf("<svg"));
      const inner = source.slice(openTagEnd + 1, source.lastIndexOf("</svg>")).replace(' id="icon"', "");
      return `<symbol id="icon-${name}" viewBox="0 0 24 24">${inner}</symbol>`;
    })
    .join("");

/*
 * Call before the markup goes in, so the static `<use>` tags in the shell resolve on their first
 * paint rather than after a re-render.
 *
 * The host is positioned out of the way rather than `display: none` — a `<symbol>` is never drawn
 * directly, but older WebKit stops resolving `<use>` into a sprite that has been display-none'd, and
 * WebKit is what the iOS build runs on.
 */
export const mountIconSprite = () => {
  if (document.getElementById(SPRITE_ID)) {
    return;
  }
  const host = document.createElement("div");
  host.id = SPRITE_ID;
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${buildSymbols()}</svg>`;
  document.body.prepend(host);
};

export const createIcon = (name: IconName) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "icon");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  const href = iconHref(name);
  use.setAttribute("href", href);
  use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
  svg.appendChild(use);
  return svg;
};

export const setButtonContent = (button: HTMLButtonElement | null, iconName: IconName, label: string, iconOnly = false) => {
  if (!button) {
    return;
  }
  button.textContent = "";
  button.setAttribute("aria-label", label);
  button.appendChild(createIcon(iconName));
  if (iconOnly) {
    button.classList.add("icon-only");
    button.title = label;
  } else {
    button.classList.remove("icon-only");
    const span = document.createElement("span");
    span.textContent = label;
    button.appendChild(span);
  }
};

export const hydrateExportActionIcons = (icons: HTMLSpanElement[]) => {
  icons.forEach((icon) => {
    const name = icon.dataset.icon as IconName | undefined;
    if (!name || !ICON_NAMES.includes(name)) {
      return;
    }
    icon.textContent = "";
    icon.appendChild(createIcon(name));
  });
};
