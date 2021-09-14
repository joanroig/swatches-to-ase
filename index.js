import { promises as fs } from "fs";
import { createRequire } from "module"; // allow require statements
import { readSwatchesFile } from "procreate-swatches";
const require = createRequire(import.meta.url); // allow require statements
var convert = require("color-convert");
var ase = require("ase-utils");

// Convert Procreate .swatches to Adobe .ase using:
// https://github.com/szydlovski/procreate-swatches
// https://www.npmjs.com/package/color-convert
// https://github.com/DominikGuzei/node-ase-utils

(async () => {
  const fileName = "Midnight_Produce";
  const addBlackWhite = true;
  const data = await fs.readFile("palette-import/" + fileName + ".swatches");

  readSwatchesFile(data).then((result) => {
    let colors = [];

    if (addBlackWhite) {
      colors.push[
        ({
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
        })
      ];
    }

    result.colors.forEach((color, index) => {
      if (color) {
        let rgb = convert.hsv.rgb(color[0]);
        let asergb = [rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0]; // ase format needs rgb values from 0 to 1
        colors.push({
          name: "Color " + index,
          model: "RGB",
          color: asergb,
          type: "global",
        });
      }
    });

    let aseContent = {
      version: "1.0",
      groups: [],
      colors: colors,
    };

    fs.writeFile("palette-export/" + fileName + ".ase", ase.encode(aseContent));

    console.info("done!");
  });
})();
