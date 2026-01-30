import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import convert from "color-convert";

import {
  exportPaletteToGpl,
  getSupportedPaletteFormats,
  getValidFormats,
  readPaletteFile,
} from "../../src/core/palette.js";

const writeUint16BE = (bytes: number[], value: number) => {
  bytes.push((value >> 8) & 0xff, value & 0xff);
};

const writeUint32BE = (bytes: number[], value: number) => {
  bytes.push(
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff
  );
};

const writeFloat32BE = (bytes: number[], value: number) => {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, false);
  bytes.push(...new Uint8Array(buffer));
};

const writeAscii4 = (bytes: number[], text: string) => {
  const padded = (text + "    ").slice(0, 4);
  for (let i = 0; i < padded.length; i += 1) {
    bytes.push(padded.charCodeAt(i) & 0xff);
  }
};

const encodeUtf16be = (text: string) => {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const codeUnit = text.charCodeAt(i);
    bytes.push((codeUnit >> 8) & 0xff, codeUnit & 0xff);
  }
  return bytes;
};

const makeColorBlock = (
  name: string,
  model: string,
  channels: number[],
  type = 0
) => {
  const block: number[] = [];
  const nameLength = name.length + 1;
  writeUint16BE(block, nameLength);
  block.push(...encodeUtf16be(name));
  block.push(0x00, 0x00);
  writeAscii4(block, model);
  channels.forEach((value) => writeFloat32BE(block, value));
  writeUint16BE(block, type);

  const bytes: number[] = [];
  writeUint16BE(bytes, 0x0001);
  writeUint32BE(bytes, block.length);
  bytes.push(...block);
  return bytes;
};

const buildAse = (blocks: number[][]) => {
  const bytes: number[] = [];
  bytes.push("A".charCodeAt(0));
  bytes.push("S".charCodeAt(0));
  bytes.push("E".charCodeAt(0));
  bytes.push("F".charCodeAt(0));
  writeUint16BE(bytes, 1);
  writeUint16BE(bytes, 0);
  writeUint32BE(bytes, blocks.length);
  blocks.forEach((block) => bytes.push(...block));
  return new Uint8Array(bytes);
};

const normalizeRgb = (rgb: number[]): [number, number, number] => {
  const max = Math.max(...rgb);
  if (max > 1.5) {
    return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255].map((value) =>
      Math.min(Math.max(value, 0), 1)
    ) as [number, number, number];
  }
  return rgb.map((value) => Math.min(Math.max(value, 0), 1)) as [
    number,
    number,
    number,
  ];
};

const options = {
  colorNameFormat: "pantone",
  addBlackWhite: false,
};

test("readPaletteFile parses GPL files and preserves names", async () => {
  const gpl = [
    "GIMP Palette",
    "Name: Sample",
    "Columns: 4",
    "#",
    "0 0 0 Black",
    "255 255 255",
    "128 64 32 Warm Brown",
  ].join("\n");

  const palette = await readPaletteFile(gpl, "sample.gpl", options);
  assert.equal(palette.name, "Sample");
  assert.equal(palette.colors.length, 3);
  assert.equal(palette.colors[0].name, "Black");
  assert.equal(palette.colors[1].name, "Color 2");
  assert.deepEqual(palette.colors[1].rgb, [1, 1, 1]);
});

test("addBlackWhite does not duplicate existing black/white colors", async () => {
  const gpl = [
    "GIMP Palette",
    "Name: Minimal",
    "0 0 0 Black",
    "255 255 255 White",
  ].join("\n");

  const palette = await readPaletteFile(gpl, "minimal.gpl", {
    colorNameFormat: "pantone",
    addBlackWhite: true,
  });

  assert.equal(palette.colors.length, 2);
  assert.deepEqual(palette.colors[0].rgb, [0, 0, 0]);
  assert.deepEqual(palette.colors[1].rgb, [1, 1, 1]);
});

test("readPaletteFile converts ASE models to RGB", async () => {
  const ase = buildAse([
    makeColorBlock("CMYK", "CMYK", [0, 0, 0, 0]),
    makeColorBlock("LAB", "LAB", [0, 0, 0]),
    makeColorBlock("GRAY", "GRAY", [0]),
  ]);

  const palette = await readPaletteFile(ase, "sample.ase", options);
  assert.equal(palette.colors.length, 3);

  const cmykExpected = normalizeRgb(convert.cmyk.rgb(0, 0, 0, 0));
  const labExpected = normalizeRgb(convert.lab.rgb(0, 0, 0));
  const grayExpected = normalizeRgb(convert.gray.rgb(0));

  assert.deepEqual(palette.colors[0].rgb, cmykExpected);
  assert.deepEqual(palette.colors[1].rgb, labExpected);
  assert.deepEqual(palette.colors[2].rgb, grayExpected);
});

test("readPaletteFile rejects unsupported formats", async () => {
  await assert.rejects(
    () => readPaletteFile("data", "palette.txt", options),
    /Unsupported palette format/
  );
});

test("readPaletteFile validates name formats for swatches", async () => {
  const filePath = path.resolve("examples/palette-in", "Kitchen_Plant.swatches");
  const input = fs.readFileSync(filePath);
  await assert.rejects(
    () =>
      readPaletteFile(input, "Kitchen_Plant.swatches", {
        colorNameFormat: "invalid-format",
        addBlackWhite: false,
      }),
    /Invalid color name format/
  );
});

test("exportPaletteToGpl emits expected header and values", () => {
  const content = exportPaletteToGpl({
    name: "Test",
    colors: [
      { name: "Red", rgb: [1, 0, 0] },
      { name: "Green", rgb: [0, 1, 0] },
    ],
  });
  assert.ok(content.startsWith("GIMP Palette"));
  assert.ok(content.includes("Name: Test"));
  assert.ok(content.includes("255 0 0 Red"));
  assert.ok(content.endsWith("\n"));
});

test("palette format helpers expose supported values", () => {
  assert.ok(getValidFormats().includes("pantone"));
  assert.deepEqual(getSupportedPaletteFormats(), ["swatches", "ase", "gpl"]);
});
