import { readPaletteFile } from "@core/palette";

import { dropzone, fileInput, formatSelect } from "./dom";
import { state } from "./state";
import type { Palette } from "./types";
import { createId } from "./utils/id";
import { appendLog } from "./ui/notifications";
import { updateProcessingState } from "./processing";
import { getOptions } from "./preferences";
import { renderEditor, renderPaletteList, syncActivePalette } from "./palette/ui";
import { updateExportAvailability } from "./export/manager";
import { persistPalettes } from "./persistence";
import { decodeSharedPalette } from "./share";
import { normalizeHex, hexToRgb } from "./utils/color";
import { nameColor, resolveNameFormat } from "./palette/naming";

export const handleFiles = async (fileList: FileList | null) => {
  if (!fileList || state.processing) {
    return;
  }
  const files = Array.from(fileList).filter((file) =>
    [".swatches", ".ase", ".gpl"].some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    )
  );
  if (files.length === 0) {
    appendLog("No supported palette files detected.", "error");
    return;
  }

  updateProcessingState(true);
  appendLog(`Importing ${files.length} palette(s)...`, "info");

  try {
    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const paletteData = await readPaletteFile(buffer, file.name, getOptions());
        const palette: Palette = {
          id: createId(),
          name: paletteData.name,
          colors: paletteData.colors.map((color) => ({
            id: createId(),
            name: color.name,
            rgb: color.rgb,
          })),
        };
        state.palettes.push(palette);
        appendLog(`Loaded ${file.name}`, "success");
      } catch (error) {
        appendLog(
          `Failed to import ${file.name}: ${(error as Error).message}`,
          "error"
        );
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

export const importSharedPaletteFromUrl = () => {
  let url: URL;
  try {
    url = new URL(window.location.href);
  } catch {
    return;
  }
  const encoded = url.searchParams.get("import");
  if (!encoded) {
    return;
  }
  url.searchParams.delete("import");
  window.history.replaceState({}, "", url.toString());
  const payload = decodeSharedPalette(encoded);
  if (!payload) {
    appendLog("Shared palette link is invalid.", "error");
    return;
  }
  const name = payload.name?.trim() || "Shared palette";
  const colors = (payload.colors ?? [])
    .filter((color) => typeof color.hex === "string" && color.hex.trim())
    .map((color, index) => {
      const hex = normalizeHex(color.hex.trim());
      const rgb = hexToRgb(hex);
      const fallbackName =
        color.name?.trim() ||
        nameColor(
          hex.toUpperCase(),
          resolveNameFormat(formatSelect?.value ?? "pantone"),
          index
        );
      return {
        id: createId(),
        name: fallbackName,
        rgb,
      };
    });
  if (colors.length === 0) {
    appendLog("Shared palette has no colors.", "error");
    return;
  }
  const confirmed = window.confirm(`Import shared palette "${name}"?`);
  if (!confirmed) {
    return;
  }
  const palette: Palette = {
    id: createId(),
    name,
    colors,
  };
  state.palettes.unshift(palette);
  syncActivePalette(palette.id);
  appendLog("Imported shared palette.", "success");
};
