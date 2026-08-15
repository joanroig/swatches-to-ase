import {
  exportActionButtons,
  exportFormatButtons,
  exportModal,
  fabExportButton,
  openExportButton,
  removeAllButton,
} from "../dom";
import { getOpenFolderId, resolveFolderId } from "../palette/folders";
import { updateProcessingState } from "../processing";
import { buildSharedPaletteUrl } from "../share";
import { cloudState, exportState, state } from "../state";
import type { ExportMode, Palette } from "../types";
import { t } from "../i18n";
import { trackEvent } from "../cloud/analytics";
import { appendLog, showToast } from "../ui/notifications";
import { getContrastColor, getRgb255, rgbToHex } from "../utils/color";
import { escapeMarkup, sanitizeFileName } from "../utils/text";
import type { PaletteSheet } from "./builders";
import { buildCodeExport, buildCssExport, buildEmbedExport, buildPaletteSheet, buildSvgExport, buildTailwindExport } from "./builders";
import { getPaletteHexes, selectExportTargets, selectPrimaryExportPalette } from "./helpers";

let paletteToolsPromise: Promise<typeof import("@core/palette")> | null = null;

const loadPaletteTools = () => {
  paletteToolsPromise ??= import("@core/palette");
  return paletteToolsPromise;
};

const getPaletteForExportAction = () => {
  const palette = getPrimaryExportPalette();
  if (!palette) {
    appendLog(t("log.noPaletteSelected"), "error");
    return null;
  }
  if (palette.colors.length === 0) {
    appendLog(t("log.paletteNoColors"), "error");
    return null;
  }
  return palette;
};

const copyToClipboard = async (text: string, successMessage: string) => {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(text);
    appendLog(successMessage, "success");
    showToast(successMessage, "success");
  } catch (error) {
    const message = t("log.clipboardUnavailable", { message: (error as Error).message });
    appendLog(message, "error");
    showToast(message, "error");
  }
};

/**
 * `BlobPart` requires an `ArrayBufferView<ArrayBuffer>`, but a `Uint8Array` may in principle be
 * backed by a `SharedArrayBuffer`. Ours never are, so widen the parameter here rather than casting
 * at each of the call sites.
 */
type BinaryPart = BlobPart | Uint8Array;

const downloadBlob = (fileName: string, data: BinaryPart, mime: string) => {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const downloadText = (fileName: string, content: string, mime: string) => {
  downloadBlob(fileName, content, mime);
  appendLog(t("log.downloaded", { file: fileName }), "success");
};

/** The header and footer text the three picture exports share. */
const getSheetLabels = (palette: Palette) => ({
  subtitle: t("palette.colors", { count: palette.colors.length }),
  footer: t("export.print.generatedFrom"),
});

/** Retina-ish, so the hex labels are not a blur when the image is opened at full size. */
const PNG_SCALE = 2;

const roundedRectPath = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  context.beginPath();
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, radius);
    return;
  }
  context.rect(x, y, width, height);
};

const drawPaletteSheet = (context: CanvasRenderingContext2D, sheet: PaletteSheet) => {
  const write = (value: string, x: number, y: number, size: number, fill: string, weight = "400", align: CanvasTextAlign = "center") => {
    context.font = `${weight} ${size}px ${sheet.fontFamily}`;
    context.fillStyle = fill;
    context.textAlign = align;
    context.fillText(value, x, y);
  };

  context.fillStyle = sheet.background;
  context.fillRect(0, 0, sheet.width, sheet.height);
  context.textBaseline = "alphabetic";

  write(sheet.title, sheet.padding, sheet.headerBaseline, 26, sheet.titleColor, "bold", "left");
  if (sheet.subtitle) {
    write(sheet.subtitle, sheet.width - sheet.padding, sheet.headerBaseline, 14, sheet.mutedColor, "normal", "right");
  }

  sheet.cells.forEach((cell) => {
    const center = cell.x + sheet.swatchWidth / 2;
    roundedRectPath(context, cell.x, cell.y, sheet.swatchWidth, sheet.swatchHeight, sheet.radius);
    context.fillStyle = cell.hex;
    context.fill();
    context.strokeStyle = sheet.strokeColor;
    context.lineWidth = 1;
    context.stroke();

    write(cell.hex, center, cell.y + sheet.swatchHeight - 18, 16, cell.contrast, "bold");
    write(cell.name, center, cell.y + sheet.swatchHeight + 22, 13, sheet.nameColor, "bold");
    write(cell.rgb, center, cell.y + sheet.swatchHeight + 41, 11, sheet.mutedColor);
  });

  if (sheet.footer) {
    write(sheet.footer, sheet.width / 2, sheet.footerBaseline, 12, sheet.mutedColor);
  }
};

const downloadPng = async (palette: Palette) => {
  const sheet = buildPaletteSheet(palette, getSheetLabels(palette));
  const canvas = document.createElement("canvas");
  canvas.width = sheet.width * PNG_SCALE;
  canvas.height = sheet.height * PNG_SCALE;
  const context = canvas.getContext("2d");
  if (!context) {
    appendLog(t("log.imageRenderFailed"), "error");
    return;
  }
  context.scale(PNG_SCALE, PNG_SCALE);
  drawPaletteSheet(context, sheet);
  canvas.toBlob((blob) => {
    if (!blob) {
      appendLog(t("log.imageGenerateFailed"), "error");
      return;
    }
    downloadBlob(`${sanitizeFileName(palette.name)}.png`, blob, "image/png");
    appendLog(t("log.downloadedImage"), "success");
  }, "image/png");
};

const openPrintExport = (palette: Palette) => {
  const pageTitle = t("export.print.title", { name: palette.name });
  const labels = getSheetLabels(palette);
  const swatches = palette.colors
    .map((color) => {
      const hex = rgbToHex(color.rgb).toUpperCase();
      const [r, g, b] = getRgb255(color.rgb);
      return `
          <figure class="swatch">
            <div class="chip" style="background:${hex};color:${getContrastColor(color.rgb)}"><span>${hex}</span></div>
            <figcaption>
              <span class="name">${escapeMarkup(color.name)}</span>
              <span class="value">${r}, ${g}, ${b}</span>
            </figcaption>
          </figure>`;
    })
    .join("");
  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeMarkup(pageTitle)}</title>
        <style>
          /* Browsers drop background colors when printing unless asked not to — which for a palette
             is the entire document. */
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body { font-family: Arial, Helvetica, sans-serif; margin: 32px; color: #0f172a; }
          header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
                   border-bottom: 1px solid rgba(15, 23, 42, 0.14); padding-bottom: 12px; }
          h1 { font-size: 22px; margin: 0; }
          .count { font-size: 13px; color: #64748b; }
          .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                  gap: 16px; margin: 24px 0 0; }
          .swatch { margin: 0; break-inside: avoid; }
          .chip { height: 110px; border-radius: 12px; border: 1px solid rgba(15, 23, 42, 0.14);
                  display: flex; align-items: flex-end; justify-content: center; padding-bottom: 10px;
                  font-size: 14px; font-weight: 700; letter-spacing: 0.04em; }
          figcaption { display: grid; gap: 2px; margin-top: 8px; text-align: center; }
          .name { font-size: 13px; font-weight: 700; }
          .value { font-size: 11px; color: #64748b; }
          footer { margin-top: 28px; font-size: 12px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <header>
          <h1>${escapeMarkup(palette.name)}</h1>
          <span class="count">${escapeMarkup(labels.subtitle)}</span>
        </header>
        <div class="grid">${swatches}</div>
        <footer>${escapeMarkup(labels.footer)}</footer>
      </body>
    </html>
  `;
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    appendLog(t("log.printPreviewFailed"), "error");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

export const canUseNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/*
 * The OS share sheet, where there is one — on the phone builds that is the only way a palette
 * reaches the app someone actually wants to send it to. Everywhere else the button is hidden rather
 * than falling back silently to something the URL button already does.
 */
const shareNatively = async (palette: Palette, url: string) => {
  if (!canUseNativeShare()) {
    await copyToClipboard(url, t("toast.exportShareUrlCopied"));
    return;
  }
  try {
    await navigator.share({ title: palette.name, text: t("export.share.palette", { name: palette.name }), url });
    appendLog(t("log.shareOpened"), "success");
  } catch (error) {
    // Dismissing the sheet rejects with AbortError. That is not a failure worth shouting about.
    if ((error as Error).name === "AbortError") {
      return;
    }
    const message = t("log.shareCanceled", { message: (error as Error).message });
    appendLog(message, "error");
    showToast(message, "error");
  }
};

const openShareLink = (url: string, text: string) => {
  const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  window.open(shareUrl, "_blank");
};

const openPinterestLink = (url: string, description: string) => {
  const pinUrl = `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(
    url,
  )}&description=${encodeURIComponent(description)}`;
  window.open(pinUrl, "_blank");
};

const exportSinglePalette = async (palette: Palette, format: string) => {
  const { exportPaletteToAse, exportPaletteToGpl, exportPaletteToSwatches } = await loadPaletteTools();
  const cleanName = sanitizeFileName(palette.name);
  const payload = {
    name: palette.name,
    colors: palette.colors.map((color) => ({
      name: color.name,
      rgb: color.rgb,
    })),
  };

  if (format === "all") {
    await exportSinglePalette(palette, "ase");
    await exportSinglePalette(palette, "swatches");
    await exportSinglePalette(palette, "gpl");
    return;
  }

  if (format === "swatches") {
    const data = await exportPaletteToSwatches(payload);
    downloadBlob(`${cleanName}.swatches`, data, "application/octet-stream");
    return;
  }
  if (format === "gpl") {
    const data = exportPaletteToGpl(payload);
    downloadBlob(`${cleanName}.gpl`, data, "text/plain");
    return;
  }
  const data = exportPaletteToAse(payload);
  downloadBlob(`${cleanName}.ase`, data, "application/octet-stream");
};

const exportPalettes = async (palettes: Palette[], format: string) => {
  if (palettes.length === 0) {
    appendLog(t("log.noPalettesToExport"), "error");
    return;
  }
  updateProcessingState(true);
  appendLog(t("log.exporting", { count: palettes.length }), "info");

  try {
    const [{ default: JSZip }, { exportPaletteToAse, exportPaletteToGpl, exportPaletteToSwatches }] = await Promise.all([
      import("jszip"),
      loadPaletteTools(),
    ]);
    const zip = new JSZip();
    for (const palette of palettes) {
      const cleanName = sanitizeFileName(palette.name);
      const payload = {
        name: palette.name,
        colors: palette.colors.map((color) => ({
          name: color.name,
          rgb: color.rgb,
        })),
      };

      if (format === "all") {
        const ase = exportPaletteToAse(payload);
        const gpl = exportPaletteToGpl(payload);
        const swatches = await exportPaletteToSwatches(payload);
        zip.file(`${cleanName}.ase`, ase);
        zip.file(`${cleanName}.gpl`, gpl);
        zip.file(`${cleanName}.swatches`, swatches);
      } else if (format === "swatches") {
        const data = await exportPaletteToSwatches(payload);
        zip.file(`${cleanName}.swatches`, data);
      } else if (format === "gpl") {
        const data = exportPaletteToGpl(payload);
        zip.file(`${cleanName}.gpl`, data);
      } else {
        const data = exportPaletteToAse(payload);
        zip.file(`${cleanName}.ase`, data);
      }
    }

    const zipBytes = await zip.generateAsync({ type: "uint8array" });
    const saveResult = await window.desktopApi?.saveZip?.({
      fileName: `palette-studio.${format}.zip`,
      data: zipBytes,
    });

    if (saveResult?.saved) {
      appendLog(t("log.zipSaved"), "success");
    } else if (window.desktopApi) {
      appendLog(t("log.zipCanceled"), "info");
    } else {
      const blob = new Blob([zipBytes as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `palette-studio.${format}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      appendLog(t("log.zipReady"), "success");
    }
  } finally {
    updateProcessingState(false);
  }
};

const getPrimaryExportPalette = () => {
  const targets = getExportTargets();
  return selectPrimaryExportPalette(targets, state.palettes, state.activePaletteId);
};

export const setExportMode = (mode: ExportMode) => {
  exportState.mode = mode;
  if (exportModal) {
    exportModal.dataset.exportMode = mode;
  }
  updateExportAvailability();
};

/*
 * What "everything" means right now.
 *
 * Inside a folder it means that folder: the panel is showing one folder's palettes, and an "Export
 * all" that quietly reached past it into the rest of the library would be exporting things the
 * screen is not even displaying.
 */
const getExportScope = () => {
  const open = getOpenFolderId();
  if (!open) {
    return state.palettes;
  }
  const folderId = resolveFolderId(open);
  return state.palettes.filter((palette) => (palette.folderId ?? null) === folderId);
};

export const updateExportAvailability = () => {
  const hasPalettes = getExportScope().length > 0;
  if (openExportButton) {
    openExportButton.disabled = !hasPalettes;
  }
  if (fabExportButton) {
    fabExportButton.disabled = !hasPalettes;
  }
  if (removeAllButton) {
    removeAllButton.disabled = !hasPalettes;
  }
  exportFormatButtons.forEach((button) => {
    button.disabled = !hasPalettes;
  });
  exportActionButtons.forEach((button) => {
    button.disabled = !hasPalettes || exportState.mode === "batch";
  });
};

export const getExportTargets = () => selectExportTargets(exportState.mode, getExportScope(), state.activePaletteId);

export const exportPalettesSmart = async (palettes: Palette[], format: string) => {
  if (palettes.length === 0) {
    appendLog(t("log.noPalettesToExport"), "error");
    return;
  }
  trackEvent("palette_exported", { format, count: palettes.length });
  // More than one palette, or more than one file each, and it has to be a zip.
  if (palettes.length > 1 || format === "all") {
    await exportPalettes(palettes, format);
    return;
  }
  await exportSinglePalette(palettes[0], format);
};

export const handleExportAction = async (action: string | undefined) => {
  const palette = getPaletteForExportAction();
  if (!palette || !action) {
    return;
  }
  trackEvent("palette_shared", { action });
  const cleanName = sanitizeFileName(palette.name);
  const coolorsUrl = `https://coolors.co/${getPaletteHexes(palette).join("-")}`;
  // Signed in, the link says who sent it. Signed out there is nobody to name, and it stays a plain
  // list of colors.
  const shareUrl = buildSharedPaletteUrl(palette, cloudState.user ? { id: cloudState.user.uid, name: cloudState.user.name } : null);

  switch (action) {
    case "url":
      await copyToClipboard(shareUrl, t("toast.exportShareUrlCopied"));
      break;
    case "share":
      await shareNatively(palette, shareUrl);
      break;
    case "pdf":
      openPrintExport(palette);
      break;
    case "image":
      await downloadPng(palette);
      break;
    case "css": {
      const css = buildCssExport(palette);
      downloadText(`${cleanName}.css`, css, "text/css");
      await copyToClipboard(css, t("toast.exportCssCopied"));
      break;
    }
    case "svg": {
      const svg = buildSvgExport(palette, getSheetLabels(palette));
      downloadText(`${cleanName}.svg`, svg, "image/svg+xml");
      await copyToClipboard(svg, t("toast.exportSvgCopied"));
      break;
    }
    case "code": {
      const code = buildCodeExport(palette);
      downloadText(`${cleanName}.json`, code, "application/json");
      await copyToClipboard(code, t("toast.exportCodeCopied"));
      break;
    }
    case "tailwind": {
      const tailwind = buildTailwindExport(palette);
      downloadText(`${cleanName}.tailwind.js`, tailwind, "text/javascript");
      await copyToClipboard(tailwind, t("toast.exportTailwindCopied"));
      break;
    }
    case "embed": {
      const embed = buildEmbedExport(palette);
      downloadText(`${cleanName}.html`, embed, "text/html");
      await copyToClipboard(embed, t("toast.exportEmbedCopied"));
      break;
    }
    case "coolors":
      window.open(coolorsUrl, "_blank");
      break;
    case "x":
      openShareLink(shareUrl, t("export.share.palette", { name: palette.name }));
      break;
    case "pinterest":
      openPinterestLink(shareUrl, t("export.share.palette", { name: palette.name }));
      break;
    default:
      appendLog(t("log.exportActionUnavailable"), "error");
  }
};
