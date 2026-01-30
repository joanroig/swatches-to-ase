import fs from "fs";
import path from "path";

import {
  exportPaletteToAse,
  exportPaletteToGpl,
  exportPaletteToSwatches,
  getSupportedPaletteFormats,
  readPaletteFile,
} from "../core/palette.js";
import type { Palette, PaletteFormat } from "../core/palette.js";

type Config = {
  inFolder: string;
  outFolder: string;
  colorNameFormat: string;
  addBlackWhite: boolean;
  outFormats?: PaletteFormat[] | string;
  outFormat?: PaletteFormat | string;
};

const SUPPORTED_FORMATS = getSupportedPaletteFormats();
const SUPPORTED_FORMAT_SET = new Set<PaletteFormat>(SUPPORTED_FORMATS);

const normalizeOutFormats = (value: Config["outFormats"]): PaletteFormat[] => {
  if (!value) {
    return ["ase"];
  }
  const raw = Array.isArray(value)
    ? value
    : String(value)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
  const normalized = raw.map((entry) => entry.toLowerCase().trim());
  if (normalized.includes("all")) {
    return [...SUPPORTED_FORMATS];
  }
  const invalid = normalized.filter(
    (entry) => !SUPPORTED_FORMAT_SET.has(entry as PaletteFormat)
  );
  if (invalid.length > 0) {
    throw new Error(
      `Unsupported output format(s): ${invalid.join(
        ", "
      )}. Use: ${SUPPORTED_FORMATS.join(", ")}.`
    );
  }
  return Array.from(new Set(normalized)) as PaletteFormat[];
};

const exportPalette = async (
  palette: Palette,
  format: PaletteFormat
): Promise<Uint8Array | string> => {
  if (format === "swatches") {
    return exportPaletteToSwatches(palette);
  }
  if (format === "gpl") {
    return exportPaletteToGpl(palette);
  }
  return exportPaletteToAse(palette);
};

export class ColorConverter {
  inFolderPath: string;
  outFolderPath: string;
  colorNameFormat: string;
  addBlackWhite: boolean;
  outFormats: PaletteFormat[];

  constructor() {
    const config = JSON.parse(
      fs.readFileSync("./config.json", "utf-8")
    ) as Config;
    this.inFolderPath = config.inFolder;
    this.outFolderPath = config.outFolder;
    this.colorNameFormat = config.colorNameFormat;
    this.addBlackWhite = config.addBlackWhite;
    this.outFormats = normalizeOutFormats(
      config.outFormats ?? config.outFormat ?? "ase"
    );
  }

  async start() {
    await fs.promises.mkdir(this.outFolderPath, { recursive: true });
    const files = await fs.promises.readdir(this.inFolderPath);

    for (const file of files) {
      const ext = path.extname(file).slice(1).toLowerCase();
      if (!SUPPORTED_FORMAT_SET.has(ext as PaletteFormat)) {
        continue;
      }

      console.info("Converting: " + file);
      const fileName = path.basename(file, path.extname(file));
      const inputPath = path.join(this.inFolderPath, file);
      const data = new Uint8Array(await fs.promises.readFile(inputPath));

      try {
        const palette = await readPaletteFile(data, file, {
          colorNameFormat: this.colorNameFormat,
          addBlackWhite: this.addBlackWhite,
        });
        for (const format of this.outFormats) {
          const outputPath = path.join(this.outFolderPath, `${fileName}.${format}`);
          const output = await exportPalette(palette, format);
          if (typeof output === "string") {
            await fs.promises.writeFile(outputPath, output, "utf8");
          } else {
            await fs.promises.writeFile(outputPath, output);
          }
        }
      } catch (error) {
        console.error(error);
      }
    }
    console.log("All done!");
  }
}
