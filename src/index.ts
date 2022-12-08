// eslint-disable-next-line
// @ts-ignore
import { encode } from "ase-utils";
// eslint-disable-next-line
// @ts-ignore
import { readSwatchesFile } from "procreate-swatches";
// eslint-disable-next-line
// @ts-ignore
import ColorHelper from "color-to-name";

import convert from "color-convert";
import { HSV } from "color-convert/conversions";
import fs from "fs";

const addBlackWhite = process.argv[2];
const inFolder = "palette-in/";

fs.readdir(inFolder, (err, files) => {
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
    const data = fs.readFileSync(inFolder + file);

    readSwatchesFile(data).then((result: { name: string; colors: [HSV[]] }) => {
      const colors = [];

      if (addBlackWhite) {
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
          const name = ColorHelper.findClosestColor(hex).name;

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
      fs.writeFileSync("palette-out/" + fileName + ".ase", encode(aseContent));
    });
  }
  console.log("All done!");
});
