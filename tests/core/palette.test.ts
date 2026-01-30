import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import convert from "color-convert";
import { readSwatchesFile } from "procreate-swatches";

import { convertSwatchesToAse } from "../../src/core/converter.js";
import {
  exportPaletteToAse,
  exportPaletteToGpl,
  exportPaletteToSwatches,
  readPaletteFile,
} from "../../src/core/palette.js";

const fixturesDir = path.resolve("tests/fixtures");
const sampleInputs = [
  "Kitchen_Plant.swatches",
  "Midnight_Produce.swatches",
  "Wild_Moments.swatches",
];

const options = {
  colorNameFormat: "pantone",
  addBlackWhite: false,
};

test("convertSwatchesToAse produces stable ASE output", async () => {
  for (const fileName of sampleInputs) {
    const input = fs.readFileSync(
      path.resolve("examples/palette-in", fileName)
    );
    const expected = fs.readFileSync(
      path.join(fixturesDir, "ase", fileName.replace(".swatches", ".ase"))
    );
    const actual = await convertSwatchesToAse(input, options);
    assert.equal(
      Buffer.compare(Buffer.from(actual), expected),
      0,
      `${fileName} did not match fixture`
    );
  }
});

test("readPaletteFile preserves swatches metadata", async () => {
  const input = fs.readFileSync(
    path.resolve("examples/palette-in", "Kitchen_Plant.swatches")
  );
  const expected = await readSwatchesFile(input);
  const palette = await readPaletteFile(input, "Kitchen_Plant.swatches", options);

  assert.equal(palette.name, expected.name);
  assert.equal(palette.colors.length, expected.colors.filter(Boolean).length);
});

test("palette exports remain deterministic across formats", async () => {
  const input = fs.readFileSync(
    path.resolve("examples/palette-in", "Kitchen_Plant.swatches")
  );
  const palette = await readPaletteFile(input, "Kitchen_Plant.swatches", options);

  const aseExpected = fs.readFileSync(
    path.join(fixturesDir, "exports", "Kitchen_Plant.ase")
  );
  const gplExpected = fs
    .readFileSync(path.join(fixturesDir, "exports", "Kitchen_Plant.gpl"), "utf8")
    .replace(/\r\n/g, "\n");

  const aseActual = exportPaletteToAse(palette);
  const gplActual = exportPaletteToGpl(palette);
  const swatchesActual = await exportPaletteToSwatches(palette);

  assert.equal(Buffer.compare(Buffer.from(aseActual), aseExpected), 0);
  assert.equal(gplActual.replace(/\r\n/g, "\n"), gplExpected);

  const decoded = await readSwatchesFile(swatchesActual);
  assert.equal(decoded.name, palette.name);
  const decodedColors = decoded.colors.filter(Boolean) as Array<
    [[number, number, number], string]
  >;
  const paletteColors = palette.colors.slice(0, decodedColors.length);

  assert.equal(decodedColors.length, paletteColors.length);
  decodedColors.forEach(([hsv], index) => {
    const rgb = convert.hsv.rgb(hsv);
    const expected = paletteColors[index].rgb.map((value) =>
      Math.round(value * 255)
    );
    rgb.forEach((channel, channelIndex) => {
      assert.ok(
        Math.abs(channel - expected[channelIndex]) <= 2,
        `Swatches color ${index + 1} channel ${channelIndex + 1} mismatch`
      );
    });
  });
});

test("addBlackWhite prepends black and white for ase and gpl imports", async () => {
  const aseInput = fs.readFileSync(
    path.join(fixturesDir, "ase", "Kitchen_Plant.ase")
  );
  const gplInput = fs.readFileSync(
    path.join(fixturesDir, "exports", "Kitchen_Plant.gpl"),
    "utf8"
  );

  const importOptions = {
    colorNameFormat: "pantone",
    addBlackWhite: true,
  };

  const asePalette = await readPaletteFile(
    aseInput,
    "Kitchen_Plant.ase",
    importOptions
  );
  const gplPalette = await readPaletteFile(
    gplInput,
    "Kitchen_Plant.gpl",
    importOptions
  );

  assert.deepEqual(asePalette.colors[0]?.rgb, [0, 0, 0]);
  assert.deepEqual(asePalette.colors[1]?.rgb, [1, 1, 1]);
  assert.deepEqual(gplPalette.colors[0]?.rgb, [0, 0, 0]);
  assert.deepEqual(gplPalette.colors[1]?.rgb, [1, 1, 1]);
});
