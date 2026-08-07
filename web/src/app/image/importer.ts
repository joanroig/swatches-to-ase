import { trackEvent } from "../cloud/analytics";
import {
  imageAutoControls,
  imageCanvas,
  imageCountInput,
  imageCountValue,
  imageCreateButton,
  imageDropzone,
  imageInput,
  imageModeOptions,
  imagePointsHint,
  imagePointsLayer,
  imagePreview,
  imageSimilarityInput,
  imageSimilarityValue,
  imageStage,
  imageStrip,
  importModal,
  importPanels,
  importSourceOptions,
} from "../dom";
import { t } from "../i18n";
import { resolveActiveNameFormat } from "../palette/format";
import { nameColor } from "../palette/naming";
import { syncActivePalette } from "../palette/ui";
import { state } from "../state";
import type { Palette } from "../types";
import { setModalOpen } from "../ui/modals";
import { appendLog, showToast } from "../ui/notifications";
import { getContrastColor, rgbToHex } from "../utils/color";
import { createId } from "../utils/id";
import type { Rgb255 } from "./quantize";
import { loadImageSampler, type ImageSampler } from "./sampler";

type Mode = "auto" | "points";
type SamplePoint = { id: string; x: number; y: number; rgb: Rgb255 };

const toUnitRgb = (rgb: Rgb255): [number, number, number] => [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];

const session = {
  sampler: null as ImageSampler | null,
  fileName: "",
  mode: "auto" as Mode,
  points: [] as SamplePoint[],
  colors: [] as Rgb255[],
};

const setPanel = (source: string) => {
  importPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.importPanel === source);
  });
};

const setMode = (mode: Mode) => {
  session.mode = mode;
  imageAutoControls?.classList.toggle("is-hidden", mode !== "auto");
  imagePointsHint?.classList.toggle("is-hidden", mode !== "points");
  imageCanvas?.classList.toggle("is-picking", mode === "points");
  renderColors();
};

const renderPoints = () => {
  if (!imagePointsLayer) {
    return;
  }
  imagePointsLayer.innerHTML = "";
  imagePointsLayer.classList.toggle("is-hidden", session.mode !== "points");
  session.points.forEach((point) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "image-point";
    marker.style.left = `${point.x * 100}%`;
    marker.style.top = `${point.y * 100}%`;
    marker.style.background = rgbToHex(toUnitRgb(point.rgb));
    marker.title = t("import.image.removePoint");
    marker.setAttribute("aria-label", t("import.image.removePoint"));
    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      session.points = session.points.filter((entry) => entry.id !== point.id);
      renderPoints();
      renderColors();
    });
    imagePointsLayer.appendChild(marker);
  });
};

const currentColors = (): Rgb255[] => {
  if (session.mode === "points") {
    return session.points.map((point) => point.rgb);
  }
  if (!session.sampler) {
    return [];
  }
  const count = Number(imageCountInput?.value ?? 6);
  const similarity = Number(imageSimilarityInput?.value ?? 12);
  return session.sampler.extract(count, similarity);
};

const renderColors = () => {
  session.colors = currentColors();
  if (imageStrip) {
    imageStrip.innerHTML = "";
    if (session.colors.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = t("import.image.noColors");
      imageStrip.appendChild(empty);
    } else {
      session.colors.forEach((rgb) => {
        const hex = rgbToHex(toUnitRgb(rgb)).toUpperCase();
        const chip = document.createElement("span");
        chip.className = "image-chip";
        chip.style.background = hex;
        chip.style.color = getContrastColor(toUnitRgb(rgb));
        chip.title = hex;
        chip.textContent = hex.replace("#", "");
        imageStrip.appendChild(chip);
      });
    }
  }
  if (imageCreateButton) {
    imageCreateButton.disabled = session.colors.length === 0;
  }
};

const resetSession = () => {
  session.sampler = null;
  session.fileName = "";
  session.points = [];
  session.colors = [];
  imageStage?.classList.add("is-hidden");
  renderColors();
};

const loadFile = async (file: File) => {
  if (!file.type.startsWith("image/")) {
    showToast(t("toast.profileImageType"), "error");
    return;
  }
  try {
    session.sampler = await loadImageSampler(file);
    session.fileName = file.name.replace(/\.[^.]+$/, "");
    session.points = [];
    if (imagePreview) {
      // A second object URL for display: the sampler revokes its own once decoding is done.
      imagePreview.src = URL.createObjectURL(file);
    }
    imageStage?.classList.remove("is-hidden");
    renderPoints();
    renderColors();
  } catch (error) {
    console.error(error);
    showToast(t("toast.profileImageReadFailed"), "error");
    resetSession();
  }
};

const addPointAt = (clientX: number, clientY: number) => {
  if (!imageCanvas || !session.sampler || session.mode !== "points") {
    return;
  }
  const rect = imageCanvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return;
  }
  const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
  session.points.push({ id: createId(), x, y, rgb: session.sampler.sampleAt(x, y) });
  renderPoints();
  renderColors();
};

const createPaletteFromColors = () => {
  if (session.colors.length === 0) {
    return;
  }
  const nameFormat = resolveActiveNameFormat();
  const palette: Palette = {
    id: createId(),
    name: session.fileName || t("import.image.defaultName"),
    colors: session.colors.map((rgb, index) => {
      const unit = toUnitRgb(rgb);
      return {
        id: createId(),
        name: nameColor(rgbToHex(unit).toUpperCase(), nameFormat, index),
        rgb: unit,
      };
    }),
    lastModified: Date.now(),
    folderId: null,
  };
  state.palettes.unshift(palette);
  syncActivePalette(palette.id);
  trackEvent("colors_extracted_from_image", { colors: palette.colors.length, mode: session.mode });
  appendLog(t("import.image.created", { count: palette.colors.length }), "success");
  setModalOpen(importModal, false);
  resetSession();
};

export const setupImageImport = () => {
  if (!imageDropzone || !imageInput) {
    return;
  }

  importSourceOptions.forEach((option) => {
    option.addEventListener("change", () => {
      if (option.checked) {
        setPanel(option.value);
      }
    });
  });

  imageModeOptions.forEach((option) => {
    option.addEventListener("change", () => {
      if (option.checked) {
        setMode(option.value === "points" ? "points" : "auto");
      }
    });
  });

  imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    if (file) {
      void loadFile(file);
    }
    imageInput.value = "";
  });

  ["dragenter", "dragover"].forEach((type) => {
    imageDropzone.addEventListener(type, (event) => {
      event.preventDefault();
      imageDropzone.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    imageDropzone.addEventListener(type, (event) => {
      event.preventDefault();
      imageDropzone.classList.remove("is-dragover");
    });
  });
  imageDropzone.addEventListener("drop", (event) => {
    const file = (event as DragEvent).dataTransfer?.files?.[0];
    if (file) {
      void loadFile(file);
    }
  });

  imageCanvas?.addEventListener("click", (event) => {
    addPointAt(event.clientX, event.clientY);
  });

  const syncRangeLabels = () => {
    if (imageCountValue && imageCountInput) {
      imageCountValue.textContent = imageCountInput.value;
    }
    if (imageSimilarityValue && imageSimilarityInput) {
      imageSimilarityValue.textContent = imageSimilarityInput.value;
    }
  };

  [imageCountInput, imageSimilarityInput].forEach((input) => {
    input?.addEventListener("input", () => {
      syncRangeLabels();
      renderColors();
    });
  });

  imageCreateButton?.addEventListener("click", createPaletteFromColors);

  syncRangeLabels();
  setMode("auto");
  resetSession();
};
