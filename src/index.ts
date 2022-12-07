// eslint-disable-next-line
// @ts-ignore
import { encode } from "ase-utils";
// eslint-disable-next-line
// @ts-ignore
import { readSwatchesFile } from "procreate-swatches";

import convert from "color-convert";
import { HSV } from "color-convert/conversions";
import fs from "fs";

const addBlackWhite = process.argv[2];

const testFolder = "palette-import/";

fs.readdir(testFolder, (err, files) => {
  for (const file of files) {
    if (
      !file.includes(".") ||
      file.slice(file.lastIndexOf("."), file.length) !== ".swatches"
    ) {
      console.warn("File skipped: " + file);
      continue;
    }

    console.info("Converting: " + file);

    const fileName = file.slice(0, file.lastIndexOf(".")) || file;
    const data = fs.readFileSync("palette-import/" + fileName + ".swatches");

    readSwatchesFile(data).then((result: any) => {
      const colors = [];

      if (addBlackWhite) {
        colors.push(
          {
            name: "Black",
            model: "RGB",
            color: [0, 0, 0],
            type: "global",
          },
          {
            name: "White",
            model: "RGB",
            color: [255, 255, 255],
            type: "global",
          }
        );
      }

      result.colors.forEach((color: HSV[], index: string) => {
        if (color) {
          const rgb = convert.hsv.rgb(color[0]);
          const asergb = [rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0]; // ase format needs rgb values from 0 to 1
          colors.push({
            name: "Color " + index,
            model: "RGB",
            color: asergb,
            type: "global",
          });
        }
      });

      const aseContent = {
        version: "1.0",
        groups: [] as any[],
        colors: colors,
      };
      fs.writeFileSync(
        "palette-export/" + fileName + ".ase",
        encode(aseContent)
      );
    });
  }
  console.log("All done!");
});
