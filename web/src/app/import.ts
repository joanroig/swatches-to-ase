import { trackEvent } from "./cloud/analytics";
import { dropzone, fileInput, formatSelect } from "./dom";
import { updateExportAvailability } from "./export/manager";
import { getTargetFolderId } from "./palette/folders";
import { nameColor, resolveNameFormat } from "./palette/naming";
import { openViewForSharedPalette, renderEditor, renderPaletteList, syncActivePalette } from "./palette/ui";
import { persistPalettes, persistPreferences } from "./persistence";
import { applyRemotePreferences, getOptions } from "./preferences";
import { updateProcessingState } from "./processing";
import { decodeSharedPalette, decodeSharedWorkspace, parsePaletteHexSlug, takeSharedPaletteDetails, type SharedPaletteAuthor } from "./share";
import { state } from "./state";
import type { Palette } from "./types";
import { t } from "./i18n";
import { appendLog } from "./ui/notifications";
import { hexToRgb, rgbToHex } from "./utils/color";
import { createId } from "./utils/id";

/*
 * A shared palette is shown before it is taken, not after.
 *
 * This used to be a `window.confirm` naming the palette — which asked you to accept a set of colors
 * you could not see, in a dialog the app has no say over. The preview is the one the library
 * already uses, with its action row reduced to Import; closing it is the decline.
 */
const previewSharedPalette = (name: string, colors: Palette["colors"], author?: SharedPaletteAuthor | null) => {
  const palette: Palette = {
    id: createId(),
    name,
    colors,
    lastModified: Date.now(),
    // Into whichever collection is open, like everything else the app creates.
    folderId: getTargetFolderId(),
  };
  openViewForSharedPalette(palette, author ?? null, () => {
    state.palettes.unshift(palette);
    syncActivePalette(palette.id);
    appendLog(t("import.paletteImported"), "success");
  });
};

export const handleFiles = async (fileList: FileList | null) => {
  if (!fileList || state.processing) {
    return;
  }
  const files = Array.from(fileList).filter((file) => [".swatches", ".ase", ".gpl"].some((ext) => file.name.toLowerCase().endsWith(ext)));
  if (files.length === 0) {
    appendLog(t("import.noSupported"), "error");
    return;
  }

  updateProcessingState(true);
  appendLog(t("import.importing", { count: files.length }), "info");

  try {
    const { readPaletteFile } = await import("@core/palette");
    const nameFormat = resolveNameFormat(formatSelect?.value ?? "pantone");
    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const paletteData = await readPaletteFile(buffer, file.name, getOptions());
        const palette: Palette = {
          id: createId(),
          name: paletteData.name,
          colors: paletteData.colors.map((color, index) => ({
            id: createId(),
            name: nameColor(rgbToHex(color.rgb).toUpperCase(), nameFormat, index),
            rgb: color.rgb,
          })),
          lastModified: Date.now(),
          // Into the folder being browsed, like everything else the dock creates.
          folderId: getTargetFolderId(),
        };
        state.palettes.push(palette);
        trackEvent("palette_imported", { format: file.name.split(".").pop() ?? "unknown", colors: palette.colors.length });
        appendLog(t("import.loadedFile", { file: file.name }), "success");
      } catch (error) {
        appendLog(t("import.failedFile", { file: file.name, message: (error as Error).message }), "error");
      }
    }
  } finally {
    updateProcessingState(false);
    if (!state.activePaletteId && state.palettes.length > 0) {
      syncActivePalette(state.palettes[0].id);
    } else {
      renderPaletteList();
      renderEditor();
      updateExportAvailability();
      persistPalettes();
    }
  }
};

export const setupDropzone = () => {
  if (!dropzone || !fileInput) {
    return;
  }

  dropzone.addEventListener("click", () => {
    if (!state.processing) {
      fileInput.click();
    }
  });

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!state.processing) {
      dropzone.classList.add("is-dragover");
    }
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("is-dragover");
  });

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
    if (state.processing) {
      return;
    }
    const files = event.dataTransfer?.files;
    if (files) {
      void handleFiles(files);
    }
  });

  fileInput.addEventListener("change", () => void handleFiles(fileInput.files));
};

const normalizeSharedHex = (value: string) => {
  const cleaned = value.trim().replace("#", "");
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return cleaned.toUpperCase();
  }
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    return cleaned
      .split("")
      .map((channel) => `${channel}${channel}`)
      .join("")
      .toUpperCase();
  }
  return null;
};

const buildSharedColor = (hex: string, index: number, nameFormatOverride?: string) => {
  const normalized = normalizeSharedHex(hex);
  if (!normalized) {
    return null;
  }
  const swatchHex = `#${normalized}`;
  const nameFormat = resolveNameFormat(nameFormatOverride ?? formatSelect?.value ?? "pantone");
  const fallbackName = nameColor(swatchHex.toUpperCase(), nameFormat, index);
  return {
    id: createId(),
    name: fallbackName,
    rgb: hexToRgb(swatchHex),
  };
};

const extractPaletteHexesFromPath = (pathname: string) => {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return null;
  }
  const slug = segments[segments.length - 1];
  const hexes = parsePaletteHexSlug(slug);
  if (!hexes) {
    return null;
  }
  const basePath = segments.length > 1 ? `/${segments.slice(0, -1).join("/")}/` : "/";
  return { hexes, basePath };
};

export const importSharedPaletteFromUrl = () => {
  let url: URL;
  try {
    url = new URL(window.location.href);
  } catch {
    return;
  }
  const fullShare = url.searchParams.get("share");
  if (fullShare) {
    url.searchParams.delete("share");
    window.history.replaceState({}, "", url.toString());
    const payload = decodeSharedWorkspace(fullShare);
    if (!payload || !payload.preferences) {
      appendLog(t("import.completeShareInvalid"), "error");
      return;
    }
    const palettes = (payload.palettes ?? [])
      .map((sharedPalette) => {
        const paletteName = sharedPalette.name?.trim() || t("import.sharedPaletteName");
        const colors = (sharedPalette.colors ?? [])
          .map((color, index) => buildSharedColor(color.hex, index, payload.preferences?.colorNameFormat))
          .filter((color): color is NonNullable<typeof color> => !!color);
        if (colors.length === 0) {
          return null;
        }
        return {
          id: createId(),
          name: paletteName,
          colors,
          lastModified: Date.now(),
        } as Palette;
      })
      .filter((palette): palette is Palette => !!palette);
    if (palettes.length === 0) {
      appendLog(t("import.completeShareEmpty"), "error");
      return;
    }
    const ownerName = payload.user?.name?.trim() || t("import.workspaceOwner");
    const confirmed = window.confirm(
      t("import.confirmWorkspace", { count: palettes.length, owner: ownerName }),
    );
    if (!confirmed) {
      return;
    }
    applyRemotePreferences(payload.preferences);
    persistPreferences();
    state.palettes = palettes;
    const activeIndex = payload.activePaletteIndex ?? -1;
    const activePalette = activeIndex >= 0 ? palettes[activeIndex] : palettes[0];
    syncActivePalette(activePalette?.id ?? null);
    appendLog(t("import.workspaceImported"), "success");
    return;
  }

  const encoded = url.searchParams.get("import");
  if (encoded) {
    url.searchParams.delete("import");
    window.history.replaceState({}, "", url.toString());
    const payload = decodeSharedPalette(encoded);
    if (!payload) {
      appendLog(t("import.sharedPaletteInvalid"), "error");
      return;
    }
    const name = payload.name?.trim() || t("import.sharedPaletteName");
    const colors = (payload.colors ?? [])
      .filter((color) => typeof color.hex === "string" && color.hex.trim())
      .map((color, index) => buildSharedColor(color.hex.trim(), index))
      .filter((color): color is NonNullable<typeof color> => !!color);
    if (colors.length === 0) {
      appendLog(t("import.sharedPaletteEmpty"), "error");
      return;
    }
    previewSharedPalette(name, colors);
    return;
  }

  const pathPayload = extractPaletteHexesFromPath(url.pathname);
  if (!pathPayload) {
    return;
  }
  url.pathname = pathPayload.basePath;
  // Read before the rewrite, since taking them off the URL is how they stop being in the address bar.
  const details = takeSharedPaletteDetails(url);
  window.history.replaceState({}, "", url.toString());
  const name = details.name || t("import.sharedPaletteName");
  const colors = pathPayload.hexes
    .map((hex, index) => buildSharedColor(hex, index))
    .filter((color): color is NonNullable<typeof color> => !!color);
  if (colors.length === 0) {
    appendLog(t("import.sharedPaletteEmpty"), "error");
    return;
  }
  previewSharedPalette(name, colors, { id: details.authorId, name: details.authorName });
};
