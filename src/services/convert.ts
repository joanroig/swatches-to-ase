import fs from "fs";
import path from "path";

import { convertSwatchesToAse } from "../core/converter.js";

export class ColorConverter {
  inFolderPath: string;
  outFolderPath: string;
  colorNameFormat: string;
  addBlackWhite: boolean;

  constructor() {
    const config = JSON.parse(fs.readFileSync("./config.json").toString());
    this.inFolderPath = config.inFolder;
    this.outFolderPath = config.outFolder;
    this.colorNameFormat = config.colorNameFormat;
    this.addBlackWhite = config.addBlackWhite;
  }

  async start() {
    await fs.promises.mkdir(this.outFolderPath, { recursive: true });
    const files = await fs.promises.readdir(this.inFolderPath);

    for (const file of files) {
      if (path.extname(file).toLowerCase() !== ".swatches") {
        continue;
      }

      console.info("Converting: " + file);
      const fileName = path.basename(file, ".swatches");
      const inputPath = path.join(this.inFolderPath, file);
      const outputPath = path.join(this.outFolderPath, `${fileName}.ase`);
      const data = new Uint8Array(await fs.promises.readFile(inputPath));

      try {
        const aseBytes = await convertSwatchesToAse(data, {
          colorNameFormat: this.colorNameFormat,
          addBlackWhite: this.addBlackWhite,
        });
        await fs.promises.writeFile(outputPath, aseBytes);
      } catch (error) {
        console.error(error);
      }
    }
    console.log("All done!");
  }
}
