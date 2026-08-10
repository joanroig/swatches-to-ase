import { t } from "../i18n";
import { setButtonContent } from "../ui/icons";
import { showToast } from "../ui/notifications";
import { getColorMetrics, getContrastColor, hexToRgb, rgbToHex } from "../utils/color";
import { BLACK, WHITE, contrastRatio, gradeContrast } from "./contrast";
import { createColorPicker, hsvToHex, hsvToRgb } from "./picker";
import { buildShades } from "./shades";

type Rgb = [number, number, number];

export type ColorToolsOptions = {
  /** Anchor the popover next to this element. */
  anchor: HTMLElement;
  rgb: Rgb;
  name: string;
  /** Live preview while dragging; not an undo step. */
  onPreview: (rgb: Rgb) => void;
  /** A settled value that should become an undo step. */
  onCommit: (rgb: Rgb) => void;
  /** The value to restore if the popover is dismissed without committing. */
  onCancel: () => void;
};

type Tab = "picker" | "shades" | "info";

const POPOVER_MARGIN = 10;

let activePopover: { destroy: () => void } | null = null;

export const closeColorTools = () => {
  activePopover?.destroy();
  activePopover = null;
};

const copyText = async (value: string) => {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(value);
    showToast(t("toast.colorCopied"), "success");
  } catch (error) {
    console.error(error);
    showToast(t("toast.colorCopyFailed"), "error");
  }
};

const createTabButton = (tab: Tab, label: string) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "color-tools-tab";
  button.dataset.tab = tab;
  button.setAttribute("role", "tab");
  button.textContent = label;
  return button;
};

/** A labelled, click-to-copy readout row. */
const createReadout = (label: string, value: string) => {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "color-readout";
  row.title = t("action.copy");
  const key = document.createElement("span");
  key.className = "color-readout-label";
  key.textContent = label;
  const text = document.createElement("span");
  text.className = "color-readout-value";
  text.textContent = value;
  row.append(key, text);
  row.addEventListener("click", () => void copyText(value));
  return row;
};

const createContrastRow = (background: Rgb, foreground: Rgb, label: string) => {
  const ratio = contrastRatio(background, foreground);
  const grade = gradeContrast(ratio);

  const row = document.createElement("div");
  row.className = "color-contrast-row";

  const sample = document.createElement("span");
  sample.className = "color-contrast-sample";
  sample.style.background = rgbToHex(background);
  sample.style.color = rgbToHex(foreground);
  sample.textContent = "Aa";

  const meta = document.createElement("div");
  meta.className = "color-contrast-meta";
  const name = document.createElement("span");
  name.textContent = label;
  const value = document.createElement("span");
  value.className = "color-contrast-ratio";
  value.textContent = `${ratio.toFixed(2)}:1`;
  meta.append(name, value);

  const badge = document.createElement("span");
  badge.className = `color-contrast-grade is-${grade === "Fail" ? "fail" : "pass"}`;
  badge.textContent = grade;

  row.append(sample, meta, badge);
  return row;
};

export const openColorTools = (options: ColorToolsOptions) => {
  closeColorTools();

  let currentRgb: Rgb = [...options.rgb] as Rgb;
  let committed = false;

  const root = document.createElement("div");
  root.className = "color-tools";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", t("color.tools.title"));

  // ---------------------------------------------------------------- tabs ---
  const tabs = document.createElement("div");
  tabs.className = "color-tools-tabs";
  tabs.setAttribute("role", "tablist");
  const tabButtons: Record<Tab, HTMLButtonElement> = {
    picker: createTabButton("picker", t("color.tab.picker")),
    shades: createTabButton("shades", t("color.tab.shades")),
    info: createTabButton("info", t("color.tab.info")),
  };
  tabs.append(tabButtons.picker, tabButtons.shades, tabButtons.info);

  const panels = document.createElement("div");
  panels.className = "color-tools-panels";

  const pickerPanel = document.createElement("div");
  pickerPanel.className = "color-tools-panel";
  const shadesPanel = document.createElement("div");
  shadesPanel.className = "color-tools-panel";
  const infoPanel = document.createElement("div");
  infoPanel.className = "color-tools-panel";
  panels.append(pickerPanel, shadesPanel, infoPanel);

  // -------------------------------------------------------------- picker ---
  const picker = createColorPicker({
    onChange: (hsv) => {
      currentRgb = hsvToRgb(hsv);
      hexInput.value = hsvToHex(hsv);
      options.onPreview(currentRgb);
      renderDerived();
    },
    onCommit: () => {
      committed = true;
      options.onCommit(currentRgb);
    },
  });

  const hexRow = document.createElement("div");
  hexRow.className = "color-hex-row";
  const hexInput = document.createElement("input");
  hexInput.type = "text";
  hexInput.className = "color-hex-input";
  hexInput.spellcheck = false;
  hexInput.setAttribute("aria-label", t("notation.hex"));
  const hexPreview = document.createElement("span");
  hexPreview.className = "color-hex-preview";

  const applyHexInput = () => {
    const raw = hexInput.value.trim().replace(/^#/, "");
    const expanded = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
    if (!/^[0-9a-f]{6}$/i.test(expanded)) {
      hexInput.value = rgbToHex(currentRgb).toUpperCase();
      return;
    }
    currentRgb = hexToRgb(`#${expanded}`);
    picker.setColor(currentRgb);
    hexInput.value = `#${expanded.toUpperCase()}`;
    committed = true;
    options.onCommit(currentRgb);
    renderDerived();
  };
  hexInput.addEventListener("change", applyHexInput);
  hexInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyHexInput();
    }
  });

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "ghost icon-only";
  setButtonContent(copyButton, "code", t("action.copy"), true);
  copyButton.addEventListener("click", () => void copyText(rgbToHex(currentRgb).toUpperCase()));

  hexRow.append(hexInput, hexPreview, copyButton);

  // The EyeDropper API is Chromium-only; offer it when it exists and stay quiet otherwise.
  type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
  const eyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  if (eyeDropper) {
    const pickButton = document.createElement("button");
    pickButton.type = "button";
    pickButton.className = "ghost icon-only";
    setButtonContent(pickButton, "eyedropper", t("color.pickFromScreen"), true);
    pickButton.addEventListener("click", async () => {
      try {
        const result = await new eyeDropper().open();
        currentRgb = hexToRgb(result.sRGBHex);
        picker.setColor(currentRgb);
        hexInput.value = result.sRGBHex.toUpperCase();
        committed = true;
        options.onCommit(currentRgb);
        renderDerived();
      } catch {
        // The user dismissed the eyedropper.
      }
    });
    hexRow.insertBefore(pickButton, copyButton);
  }

  pickerPanel.append(picker.element, hexRow);

  // -------------------------------------------------------------- shades ---
  const shadesGrid = document.createElement("div");
  shadesGrid.className = "color-shades";
  shadesPanel.appendChild(shadesGrid);

  const renderShades = () => {
    shadesGrid.innerHTML = "";
    buildShades(currentRgb).forEach((shade) => {
      const hex = rgbToHex(shade.rgb).toUpperCase();
      const button = document.createElement("button");
      button.type = "button";
      button.className = shade.isSource ? "color-shade is-source" : "color-shade";
      button.style.background = hex;
      button.style.color = getContrastColor(shade.rgb);
      button.title = t("color.useShade", { hex });
      const label = document.createElement("span");
      label.textContent = hex.replace("#", "");
      button.appendChild(label);
      button.addEventListener("click", () => {
        currentRgb = [...shade.rgb] as Rgb;
        picker.setColor(currentRgb);
        hexInput.value = hex;
        committed = true;
        options.onCommit(currentRgb);
        renderDerived();
      });
      shadesGrid.appendChild(button);
    });
  };

  // ---------------------------------------------------------------- info ---
  const infoBody = document.createElement("div");
  infoBody.className = "color-info";
  infoPanel.appendChild(infoBody);

  const renderInfo = () => {
    infoBody.innerHTML = "";
    const hex = rgbToHex(currentRgb).toUpperCase();
    const { r, g, b, hsb, hsl, cmyk, lab } = getColorMetrics(currentRgb);

    const header = document.createElement("div");
    header.className = "color-info-header";
    const swatch = document.createElement("span");
    swatch.className = "color-info-swatch";
    swatch.style.background = hex;
    const title = document.createElement("div");
    const nameEl = document.createElement("strong");
    nameEl.textContent = options.name;
    const hexEl = document.createElement("span");
    hexEl.className = "color-info-hex";
    hexEl.textContent = hex;
    title.append(nameEl, hexEl);
    header.append(swatch, title);

    const conversions = document.createElement("div");
    conversions.className = "color-readouts";
    conversions.append(
      createReadout(t("notation.hex"), hex),
      createReadout(t("notation.rgb"), `${r}, ${g}, ${b}`),
      createReadout(
        t("notation.hsl"),
        `${Math.round(hsl[0])}, ${Math.round(hsl[1])}%, ${Math.round(hsl[2])}%`,
      ),
      createReadout(
        t("notation.hsb"),
        `${Math.round(hsb[0])}, ${Math.round(hsb[1])}%, ${Math.round(hsb[2])}%`,
      ),
      createReadout(
        t("notation.cmyk"),
        cmyk.map((channel) => Math.round(channel)).join(", "),
      ),
      createReadout(t("notation.lab"), lab.map((channel) => Math.round(channel)).join(", ")),
    );

    const contrastTitle = document.createElement("h5");
    contrastTitle.className = "color-info-title";
    contrastTitle.textContent = t("color.contrast.title");

    const contrast = document.createElement("div");
    contrast.className = "color-contrast";
    contrast.append(
      createContrastRow(currentRgb, WHITE, t("color.contrast.white")),
      createContrastRow(currentRgb, BLACK, t("color.contrast.black")),
    );

    infoBody.append(header, conversions, contrastTitle, contrast);
  };

  /** Everything that has to follow the current colour, wherever it was changed from. */
  const renderDerived = () => {
    const hex = rgbToHex(currentRgb).toUpperCase();
    hexPreview.style.background = hex;
    if (activeTab === "shades") {
      renderShades();
    }
    if (activeTab === "info") {
      renderInfo();
    }
  };

  // --------------------------------------------------------------- state ---
  let activeTab: Tab = "picker";

  const setTab = (tab: Tab) => {
    activeTab = tab;
    (Object.keys(tabButtons) as Tab[]).forEach((key) => {
      const isActive = key === tab;
      tabButtons[key].classList.toggle("is-active", isActive);
      tabButtons[key].setAttribute("aria-selected", isActive ? "true" : "false");
    });
    pickerPanel.classList.toggle("is-active", tab === "picker");
    shadesPanel.classList.toggle("is-active", tab === "shades");
    infoPanel.classList.toggle("is-active", tab === "info");
    if (tab === "shades") {
      renderShades();
    }
    if (tab === "info") {
      renderInfo();
    }
  };

  (Object.keys(tabButtons) as Tab[]).forEach((tab) => {
    tabButtons[tab].addEventListener("click", () => setTab(tab));
  });

  root.append(tabs, panels);
  document.body.appendChild(root);

  picker.setColor(currentRgb);
  hexInput.value = rgbToHex(currentRgb).toUpperCase();
  setTab("picker");
  renderDerived();

  // ------------------------------------------------------------ position ---
  const position = () => {
    const anchorRect = options.anchor.getBoundingClientRect();
    const rect = root.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - POPOVER_MARGIN;
    const maxTop = window.innerHeight - rect.height - POPOVER_MARGIN;

    const left = Math.min(Math.max(anchorRect.left, POPOVER_MARGIN), Math.max(POPOVER_MARGIN, maxLeft));

    // Prefer below the anchor, then above it, and otherwise sit alongside it — anything rather
    // than jumping to the far edge of the screen.
    const below = anchorRect.bottom + POPOVER_MARGIN;
    const above = anchorRect.top - rect.height - POPOVER_MARGIN;
    let top: number;
    if (below <= maxTop) {
      top = below;
    } else if (above >= POPOVER_MARGIN) {
      top = above;
    } else {
      // Centre on the anchor and clamp, so it stays next to what was clicked.
      top = anchorRect.top + anchorRect.height / 2 - rect.height / 2;
    }

    root.style.left = `${left}px`;
    root.style.top = `${Math.min(Math.max(top, POPOVER_MARGIN), Math.max(POPOVER_MARGIN, maxTop))}px`;
  };
  position();
  requestAnimationFrame(() => {
    position();
    root.classList.add("is-open");
  });

  // ------------------------------------------------------------- destroy ---
  const handleOutside = (event: PointerEvent) => {
    if (event.target instanceof Node && (root.contains(event.target) || options.anchor.contains(event.target))) {
      return;
    }
    closeColorTools();
  };
  const handleKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") {
      return;
    }
    // Escape reverts, matching the editor's own cancel-on-close behaviour.
    event.stopPropagation();
    if (!committed) {
      options.onCancel();
    }
    closeColorTools();
  };

  window.addEventListener("pointerdown", handleOutside, true);
  window.addEventListener("keydown", handleKey, true);
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);

  activePopover = {
    destroy: () => {
      window.removeEventListener("pointerdown", handleOutside, true);
      window.removeEventListener("keydown", handleKey, true);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      root.remove();
    },
  };

  return activePopover;
};
