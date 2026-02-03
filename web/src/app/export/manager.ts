import { exportPaletteToAse, exportPaletteToGpl, exportPaletteToSwatches } from "@core/palette";
import JSZip from "jszip";

import { exportActionButtons, exportAllButton, exportFormatOptions, exportModal, openExportButton, removeAllButton } from "../dom";
import { updateProcessingState } from "../processing";
import { getPreferencesPayload } from "../preferences";
import { buildCompleteShareUrl, buildSharedPaletteUrl } from "../share";
import { cloudState, exportState, state } from "../state";
import type { ExportMode, Palette, SharedWorkspacePayload } from "../types";
import { t } from "../i18n";
import { appendLog, showToast } from "../ui/notifications";
import { rgbToHex } from "../utils/color";
import { sanitizeFileName } from "../utils/text";
import { buildCodeExport, buildCssExport, buildEmbedExport, buildSvgExport, buildTailwindExport } from "./builders";
import { getPaletteHexes, selectExportTargets, selectPrimaryExportPalette } from "./helpers";

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

const downloadBlob = (fileName: string, data: BlobPart, mime: string) => {
  const blob = new Blob([data], { type: mime });
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

const downloadPng = async (palette: Palette) => {
  const width = Math.max(1, palette.colors.length) * 160;
  const height = 160;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    appendLog(t("log.imageRenderFailed"), "error");
    return;
  }
  palette.colors.forEach((color, index) => {
    context.fillStyle = rgbToHex(color.rgb);
    context.fillRect(index * 160, 0, 160, height);
  });
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
  const footerLabel = t("export.print.generatedFrom");
  const html = `
    <html>
      <head>
        <title>${pageTitle}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; }
          h1 { font-size: 20px; }
          .row { display: flex; gap: 6px; margin-top: 20px; }
          .swatch { flex: 1 1 0; height: 90px; border-radius: 8px; }
          .label { margin-top: 12px; font-size: 12px; color: #555; }
        </style>
      </head>
      <body>
        <h1>${palette.name}</h1>
        <div class="row">
          ${palette.colors.map((color) => `<div class="swatch" style="background:${rgbToHex(color.rgb).toUpperCase()}"></div>`).join("")}
        </div>
        <div class="label">${footerLabel}</div>
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

const exportSinglePalette = async (palette: Palette, formatOverride?: string) => {
  const format = formatOverride ?? getSelectedExportFormat();
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

const exportPalettes = async (palettes: Palette[]) => {
  if (palettes.length === 0) {
    appendLog(t("log.noPalettesToExport"), "error");
    return;
  }
  updateProcessingState(true);
  const format = getSelectedExportFormat();
  const zip = new JSZip();
  appendLog(t("log.exporting", { count: palettes.length }), "info");

  try {
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
      const blob = new Blob([zipBytes], { type: "application/zip" });
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

const buildCompleteSharePayload = (): SharedWorkspacePayload => {
  const activePaletteIndex = state.activePaletteId ? state.palettes.findIndex((palette) => palette.id === state.activePaletteId) : -1;
  return {
    version: 1,
    user: cloudState.user?.name ? { name: cloudState.user.name } : undefined,
    palettes: state.palettes.map((palette) => ({
      name: palette.name,
      colors: palette.colors.map((color) => ({
        hex: rgbToHex(color.rgb).replace("#", "").toUpperCase(),
      })),
    })),
    preferences: getPreferencesPayload(),
    activePaletteIndex: activePaletteIndex >= 0 ? activePaletteIndex : null,
  };
};

export const getSelectedExportFormat = () => exportFormatOptions.find((option) => option.checked)?.value ?? "all";

export const setSelectedExportFormat = (format: string) => {
  const normalized = format.toLowerCase();
  const match = exportFormatOptions.find((option) => option.value === normalized);
  if (match) {
    match.checked = true;
  }
};

export const setExportMode = (mode: ExportMode) => {
  exportState.mode = mode;
  if (exportModal) {
    exportModal.dataset.exportMode = mode;
  }
  updateExportAvailability();
};

export const updateExportAvailability = () => {
  const hasPalettes = state.palettes.length > 0;
  if (openExportButton) {
    openExportButton.disabled = !hasPalettes;
  }
  if (removeAllButton) {
    removeAllButton.disabled = !hasPalettes;
  }
  if (exportAllButton) {
    exportAllButton.disabled = !hasPalettes;
  }
  exportActionButtons.forEach((button) => {
    button.disabled = !hasPalettes || exportState.mode === "batch";
  });
};

export const getExportTargets = () => selectExportTargets(exportState.mode, state.palettes, state.activePaletteId);

export const exportPalettesSmart = async (palettes: Palette[]) => {
  if (palettes.length === 0) {
    appendLog(t("log.noPalettesToExport"), "error");
    return;
  }
  const format = getSelectedExportFormat();
  if (palettes.length > 1 || format === "all") {
    await exportPalettes(palettes);
    return;
  }
  await exportSinglePalette(palettes[0]);
};

export const handleExportAction = async (action: string | undefined) => {
  const palette = getPaletteForExportAction();
  if (!palette || !action) {
    return;
  }
  const cleanName = sanitizeFileName(palette.name);
  const coolorsUrl = `https://coolors.co/${getPaletteHexes(palette).join("-")}`;
  const shareUrl = buildSharedPaletteUrl(palette);
  const workspaceOwner = cloudState.user?.name?.trim();

  switch (action) {
    case "url":
      await copyToClipboard(shareUrl, t("toast.exportShareUrlCopied"));
      break;
    case "share":
      if (navigator.share) {
        try {
          await navigator.share({
            title: palette.name,
            text: t("export.share.palette", { name: palette.name }),
            url: shareUrl,
          });
          appendLog(t("log.shareOpened"), "success");
        } catch (error) {
          appendLog(t("log.shareCanceled", { message: (error as Error).message }), "info");
        }
      } else {
        await copyToClipboard(shareUrl, t("toast.exportShareUrlCopied"));
      }
      break;
    case "share-full": {
      const completeShareUrl = buildCompleteShareUrl(buildCompleteSharePayload());
      if (navigator.share) {
        try {
          await navigator.share({
            title: workspaceOwner
              ? t("export.share.workspaceTitle", { owner: workspaceOwner })
              : t("export.share.workspaceTitleGeneric"),
            text: workspaceOwner
              ? t("export.share.workspaceText", { owner: workspaceOwner })
              : t("export.share.workspaceTitleGeneric"),
            url: completeShareUrl,
          });
          appendLog(t("log.shareOpened"), "success");
        } catch (error) {
          appendLog(t("log.shareCanceled", { message: (error as Error).message }), "info");
        }
      } else {
        await copyToClipboard(completeShareUrl, t("toast.exportCompleteShareCopied"));
      }
      break;
    }
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
      const svg = buildSvgExport(palette);
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
