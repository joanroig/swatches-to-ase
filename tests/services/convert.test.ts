import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { ColorConverter } from "../../src/services/convert.js";

const swatchesFixture = path.resolve(
  "examples/palette-in",
  "Kitchen_Plant.swatches"
);
const aseFixture = path.resolve(
  "tests/fixtures/ase",
  "Midnight_Produce.ase"
);
const gplFixture = path.resolve(
  "tests/fixtures/exports",
  "Kitchen_Plant.gpl"
);

test("ColorConverter converts multiple palette formats into configured outputs", async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "palette-"));
  const inputDir = path.join(tempDir, "input");
  const outputDir = path.join(tempDir, "output");
  await fs.promises.mkdir(inputDir, { recursive: true });

  const swatchTarget = path.join(inputDir, "Swatch_Source.swatches");
  const aseTarget = path.join(inputDir, "Ase_Source.ase");
  const gplTarget = path.join(inputDir, "Gpl_Source.gpl");
  const nonSwatchTarget = path.join(inputDir, "ignore.txt");
  await fs.promises.copyFile(swatchesFixture, swatchTarget);
  await fs.promises.copyFile(aseFixture, aseTarget);
  await fs.promises.copyFile(gplFixture, gplTarget);
  await fs.promises.writeFile(nonSwatchTarget, "ignore");

  const config = {
    inFolder: inputDir,
    outFolder: outputDir,
    colorNameFormat: "pantone",
    addBlackWhite: false,
    outFormats: ["ase", "gpl", "swatches"],
  };
  await fs.promises.writeFile(
    path.join(tempDir, "config.json"),
    JSON.stringify(config, null, 2)
  );

  const cwd = process.cwd();
  process.chdir(tempDir);
  try {
    const converter = new ColorConverter();
    await converter.start();
  } finally {
    process.chdir(cwd);
  }

  const baseNames = ["Swatch_Source", "Ase_Source", "Gpl_Source"];
  const formats = ["ase", "gpl", "swatches"];
  for (const baseName of baseNames) {
    for (const format of formats) {
      const outputFile = path.join(outputDir, `${baseName}.${format}`);
      const outputStat = await fs.promises.stat(outputFile);
      assert.ok(outputStat.size > 0);
    }
  }
  const outputFiles = await fs.promises.readdir(outputDir);
  assert.equal(outputFiles.length, baseNames.length * formats.length);
});
