import JSZip from "jszip";

import { convertSwatchesToAse, getValidFormats } from "@core/converter";

import "./style.css";

type LogTone = "info" | "success" | "error";

const dropzone = document.querySelector<HTMLDivElement>("#dropzone");
const fileInput = document.querySelector<HTMLInputElement>("#file-input");
const formatSelect = document.querySelector<HTMLSelectElement>("#format");
const addBwToggle = document.querySelector<HTMLInputElement>("#add-bw");
const log = document.querySelector<HTMLDivElement>("#log");

const state = {
  processing: false,
};

const appendLog = (message: string, tone: LogTone = "info") => {
  if (!log) {
    return;
  }
  const item = document.createElement("div");
  item.className = `log-item ${tone}`;
  item.textContent = message;
  log.prepend(item);
};

const updateProcessingState = (busy: boolean) => {
  state.processing = busy;
  dropzone?.classList.toggle("is-busy", busy);
};

const getOptions = () => ({
  colorNameFormat: formatSelect?.value ?? "pantone",
  addBlackWhite: addBwToggle?.checked ?? true,
});

const getSwatchesFiles = (files: FileList | File[]) =>
  Array.from(files).filter((file) =>
    file.name.toLowerCase().endsWith(".swatches")
  );

const convertFilesToZip = async (files: File[]) => {
  if (files.length === 0) {
    appendLog("No .swatches files detected.", "error");
    return;
  }
  updateProcessingState(true);
  appendLog(`Converting ${files.length} palette(s)...`, "info");

  const zip = new JSZip();
  const { colorNameFormat, addBlackWhite } = getOptions();

  try {
    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const aseBytes = await convertSwatchesToAse(buffer, {
          colorNameFormat,
          addBlackWhite,
        });
        const baseName = file.name.replace(/\.swatches$/i, "");
        zip.file(`${baseName}.ase`, aseBytes);
        appendLog(`Converted ${file.name}`, "success");
      } catch (error) {
        appendLog(
          `Failed to convert ${file.name}: ${(error as Error).message}`,
          "error"
        );
      }
    }

    const zipBytes = await zip.generateAsync({ type: "uint8array" });
    const saveResult = await window.desktopApi?.saveZip?.({
      fileName: "swatches-ase.zip",
      data: zipBytes,
    });

    if (saveResult?.saved) {
      appendLog("Zip file saved on desktop.", "success");
    } else if (window.desktopApi) {
      appendLog("Zip save canceled.", "info");
    } else {
      const blob = new Blob([zipBytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "swatches-ase.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      appendLog("Zip file ready for download.", "success");
    }
  } finally {
    updateProcessingState(false);
  }
};

const handleFiles = (fileList: FileList | null) => {
  if (!fileList || state.processing) {
    return;
  }
  const files = getSwatchesFiles(fileList);
  void convertFilesToZip(files);
};

const setupDropzone = () => {
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
      handleFiles(files);
    }
  });

  fileInput.addEventListener("change", () => handleFiles(fileInput.files));
};

const setupFormatSelect = () => {
  if (!formatSelect) {
    return;
  }
  const formats = getValidFormats();
  formatSelect.innerHTML = "";
  for (const format of formats) {
    const option = document.createElement("option");
    option.value = format;
    option.textContent = format;
    formatSelect.appendChild(option);
  }
  formatSelect.value = "pantone";
};

setupFormatSelect();
setupDropzone();
