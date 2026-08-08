const ICONS = {
  settings: "/icons/settings.svg#icon",
  import: "/icons/import.svg#icon",
  generate: "/icons/generate.svg#icon",
  export: "/icons/export.svg#icon",
  view: "/icons/view.svg#icon",
  edit: "/icons/edit.svg#icon",
  trash: "/icons/trash.svg#icon",
  plus: "/icons/plus.svg#icon",
  download: "/icons/download.svg#icon",
  files: "/icons/files.svg#icon",
  duplicate: "/icons/duplicate.svg#icon",
  rows: "/icons/rows.svg#icon",
  columns: "/icons/columns.svg#icon",
  eyedropper: "/icons/eyedropper.svg#icon",
  chevronUp: "/icons/chevronUp.svg#icon",
  chevronDown: "/icons/chevronDown.svg#icon",
  chevronLeft: "/icons/chevronLeft.svg#icon",
  grip: "/icons/grip.svg#icon",
  link: "/icons/link.svg#icon",
  share: "/icons/share.svg#icon",
  pdf: "/icons/pdf.svg#icon",
  image: "/icons/image.svg#icon",
  css: "/icons/css.svg#icon",
  svg: "/icons/svg.svg#icon",
  code: "/icons/code.svg#icon",
  tailwind: "/icons/tailwind.svg#icon",
  embed: "/icons/embed.svg#icon",
  x: "/icons/x.svg#icon",
  pinterest: "/icons/pinterest.svg#icon",
  coolors: "/icons/coolors.svg#icon",
  globe: "/icons/globe.svg#icon",
  heart: "/icons/heart.svg#icon",
  bookmark: "/icons/bookmark.svg#icon",
  refresh: "/icons/refresh.svg#icon",
  login: "/icons/login.svg#icon",
  logout: "/icons/logout.svg#icon",
  cloud: "/icons/cloud.svg#icon",
  more: "/icons/more.svg#icon",
  undo: "/icons/undo.svg#icon",
  redo: "/icons/redo.svg#icon",
  playground: "/icons/playground.svg#icon",
  lock: "/icons/lock.svg#icon",
  minus: "/icons/minus.svg#icon",
  folder: "/icons/folder.svg#icon",
  inbox: "/icons/inbox.svg#icon",
  expand: "/icons/expand.svg#icon",
  collapse: "/icons/collapse.svg#icon",
  unlock: "/icons/unlock.svg#icon",
} as const;

export type IconName = keyof typeof ICONS;

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
  const href = ICONS[name];
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
  button.appendChild(createIcon(iconName));
  if (iconOnly) {
    button.classList.add("icon-only");
    button.setAttribute("aria-label", label);
    button.title = label;
  } else {
    button.classList.remove("icon-only");
    button.removeAttribute("aria-label");
    const span = document.createElement("span");
    span.textContent = label;
    button.appendChild(span);
  }
};

export const hydrateExportActionIcons = (icons: HTMLSpanElement[]) => {
  icons.forEach((icon) => {
    const name = icon.dataset.icon as IconName | undefined;
    if (!name || !(name in ICONS)) {
      return;
    }
    icon.textContent = "";
    icon.appendChild(createIcon(name));
  });
};
