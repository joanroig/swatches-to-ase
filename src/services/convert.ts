import { encode } from "ase-utils";
import convert from "color-convert";
import { HSV } from "color-convert/conversions";
import namer from "color-namer";
import fs from "fs";
import { readSwatchesFile } from "procreate-swatches";

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

  start() {
    fs.readdir(this.inFolderPath, async (err, files) => {
      for (const file of files) {
        if (
          !file.includes(".") ||
          file.slice(file.lastIndexOf("."), file.length) !== ".swatches"
        ) {
          // console.warn("File skipped: " + file);
          continue;
        }

        console.info("Converting: " + file);
        const fileName = file.slice(0, file.lastIndexOf(".")) || file;
        const data = fs.readFileSync(this.inFolderPath + file);

        await readSwatchesFile(data)
          .then(async (result: { name: string; colors: [HSV[]] }) => {
            const colors = [];

            if (this.addBlackWhite) {
              colors.push(
                {
                  name: "black",
                  model: "RGB",
                  color: [0, 0, 0],
                  type: "global",
                },
                {
                  name: "white",
                  model: "RGB",
                  color: [255, 255, 255],
                  type: "global",
                }
              );
            }

            for (const color of result.colors) {
              if (color) {
                const rgb = convert.hsv.rgb(color[0]);
                // ase format needs rgb values from 0 to 1
                const ase = [rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0];
                // get the closest color name
                const hex = `#${convert.rgb.hex(rgb)}`;
                const names = namer(hex, { pick: [this.colorNameFormat] });
                const format = Object.keys(names)[0];
                if (!format) {
                  throw new Error(
                    "Invalid color name format! Use one of the available formats in config.json: roygbiv, basic, html, x11, pantone, ntc"
                  );
                }
                const name = names[format][0].name;

                colors.push({
                  name,
                  model: "RGB",
                  color: ase,
                  type: "global",
                });
              }
            }

            const aseContent = {
              colors: colors,
            };
            fs.writeFileSync(
              this.outFolderPath + fileName + ".ase",
              encode(aseContent)
            );
          })
          .catch((e) => console.error(e));
      }
      console.log("All done!");
    });
  }
}
