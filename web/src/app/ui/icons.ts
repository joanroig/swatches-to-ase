const ICONS = {
  settings: [
    "M4 21v-7",
    "M4 10V3",
    "M12 21v-9",
    "M12 8V3",
    "M20 21v-5",
    "M20 12V3",
    "M1 14h6",
    "M9 8h6",
    "M17 16h6",
  ],
  import: [
    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
    "M7 10l5 5 5-5",
    "M12 15V3",
  ],
  generate: [
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z",
    "M5 15l.8 2.4L8 18l-2.2.6L5 21l-.8-2.4L2 18l2.2-.6L5 15z",
  ],
  export: ["M12 3v12", "M7 8l5-5 5 5", "M5 21h14"],
  view: [
    "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z",
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  ],
  edit: [
    "M12 20h9",
    "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z",
  ],
  trash: [
    "M3 6h18",
    "M8 6V4h8v2",
    "M19 6l-1 14H6L5 6",
    "M10 11v6",
    "M14 11v6",
  ],
  plus: ["M12 5v14", "M5 12h14"],
  download: [
    "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
    "M7 10l5 5 5-5",
    "M12 15V3",
  ],
  files: [
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    "M14 2v6h6",
  ],
  chevronUp: ["M6 15l6-6 6 6"],
  chevronDown: ["M6 9l6 6 6-6"],
  grip: [
    "M8 6h1",
    "M8 12h1",
    "M8 18h1",
    "M15 6h1",
    "M15 12h1",
    "M15 18h1",
  ],
  link: [
    "M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L10 5",
    "M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 1 0 7.07 7.07L14 19",
  ],
  share: [
    "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7",
    "M16 6l-4-4-4 4",
    "M12 2v14",
  ],
  pdf: [
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
    "M14 2v6h6",
    "M8 13h4",
    "M8 17h4",
  ],
  image: [
    "M21 15l-5-5L5 21",
    "M3 5h18v14H3z",
    "M8.5 9.5a1.5 1.5 0 1 0 0.01 0",
  ],
  css: ["M8 7l-3 5 3 5", "M16 7l3 5-3 5", "M12 6l-2 12"],
  svg: ["M4 4h16v16H4z", "M8 8h8v8H8z"],
  code: ["M8 9l-4 3 4 3", "M16 9l4 3-4 3", "M12 7l-2 10"],
  tailwind: [
    "M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0",
    "M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0",
  ],
  embed: ["M8 8l-4 4 4 4", "M16 8l4 4-4 4"],
  x: ["M5 5l14 14", "M19 5l-14 14"],
  pinterest: [
    "M12 2a10 10 0 1 0 0 20",
    "M9.5 18l2-7.5",
    "M12 7a3 3 0 1 1-2.6 4.5",
  ],
  coolors: [
    "M12 3a9 9 0 0 0 0 18h1a2 2 0 0 0 2-2 1 1 0 0 1 1-1h1a5 5 0 0 0 0-10h-5",
    "M7 9h.01",
    "M7 13h.01",
    "M10 7h.01",
  ],
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
  ICONS[name].forEach((d) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  });
  return svg;
};

export const setButtonContent = (
  button: HTMLButtonElement | null,
  iconName: IconName,
  label: string,
  iconOnly = false
) => {
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
