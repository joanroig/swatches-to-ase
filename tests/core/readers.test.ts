import assert from "node:assert/strict";
import { test } from "node:test";

import { getImportablePaletteFormats, readPaletteFile } from "../../src/core/palette.js";

const OPTIONS = { colorNameFormat: "pantone", addBlackWhite: false };

const read = (data: ArrayBuffer | Uint8Array | string, fileName: string) => readPaletteFile(data, fileName, OPTIONS);

const to255 = (rgb: [number, number, number]) => rgb.map((channel) => Math.round(channel * 255));

const writeUint16BE = (bytes: number[], value: number) => {
  bytes.push((value >> 8) & 0xff, value & 0xff);
};

const writeUint32BE = (bytes: number[], value: number) => {
  bytes.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
};

test("every importable extension has a reader", async () => {
  const formats = getImportablePaletteFormats();
  ["swatches", "ase", "gpl", "aco", "act", "pal", "json", "css", "hex", "txt"].forEach((format) => {
    assert.ok(formats.includes(format), `${format} should be importable`);
  });
});

test("a plain hex list imports in order", async () => {
  const palette = await read(["; exported from somewhere", "#FF0000", "00FF00 Leaf green", "#00f", ""].join("\n"), "coolors.hex");
  assert.equal(palette.name, "coolors");
  assert.deepEqual(
    palette.colors.map((color) => to255(color.rgb)),
    [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ],
  );
  assert.equal(palette.colors[1].name, "Leaf green");
});

test("a paint.net text palette reads eight digits as ARGB", async () => {
  const palette = await read(["; paint.net Palette File", "FF3366CC", "80FFAA00"].join("\n"), "paint.txt");
  assert.deepEqual(
    palette.colors.map((color) => to255(color.rgb)),
    [
      [51, 102, 204],
      [255, 170, 0],
    ],
  );
});

test("a stylesheet imports its custom properties with their names", async () => {
  const css = [":root {", "  --brand-blue: #0af;", "  --brand-ink: rgb(15, 23, 42);", "  --brand-blue-again: #00aaff;", "}"].join("\n");
  const palette = await read(css, "theme.css");
  assert.deepEqual(
    palette.colors.map((color) => color.name),
    ["brand blue", "brand ink"],
  );
  assert.deepEqual(to255(palette.colors[0].rgb), [0, 170, 255]);
  assert.deepEqual(to255(palette.colors[1].rgb), [15, 23, 42]);
});

test("a stylesheet with no variables falls back to the colors it uses", async () => {
  const palette = await read(".a { color: #123456; } .b { background: #654321; }", "styles.scss");
  assert.deepEqual(
    palette.colors.map((color) => to255(color.rgb)),
    [
      [18, 52, 86],
      [101, 67, 33],
    ],
  );
});

test("JSON imports in whichever shape it arrives", async () => {
  const ours = await read(JSON.stringify([{ name: "Sunset", hex: "#FF8800", rgb: [255, 136, 0] }]), "export.json");
  assert.equal(ours.colors[0].name, "Sunset");
  assert.deepEqual(to255(ours.colors[0].rgb), [255, 136, 0]);

  const sketch = await read(
    JSON.stringify({ compatibleVersion: "2.0", colors: [{ red: 1, green: 0.5, blue: 0, alpha: 1 }] }),
    "brand.sketchpalette",
  );
  assert.deepEqual(to255(sketch.colors[0].rgb), [255, 128, 0]);

  const map = await read(JSON.stringify({ "brand-blue": "#0af" }), "tokens.json");
  assert.equal(map.colors[0].name, "brand-blue");
  assert.deepEqual(to255(map.colors[0].rgb), [0, 170, 255]);

  const bare = await read(JSON.stringify(["#000000", "#ffffff"]), "list.json");
  assert.equal(bare.colors.length, 2);
});

test("a JASC .pal imports its entries", async () => {
  const palette = await read(["JASC-PAL", "0100", "3", "255 0 0", "0 255 0", "0 0 255"].join("\n"), "sprite.pal");
  assert.deepEqual(
    palette.colors.map((color) => to255(color.rgb)),
    [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ],
  );
});

test("a RIFF .pal imports its entries", async () => {
  const entries = [
    [255, 0, 0],
    [0, 128, 255],
  ];
  const bytes: number[] = [];
  const push = (text: string) => text.split("").forEach((character) => bytes.push(character.charCodeAt(0)));
  push("RIFF");
  bytes.push(0, 0, 0, 0);
  push("PAL ");
  push("data");
  bytes.push(0, 0, 0, 0);
  bytes.push(0x00, 0x03); // version
  bytes.push(entries.length & 0xff, 0x00); // little-endian count
  entries.forEach(([r, g, b]) => bytes.push(r, g, b, 0));

  const palette = await read(new Uint8Array(bytes), "windows.pal");
  assert.deepEqual(
    palette.colors.map((color) => to255(color.rgb)),
    entries,
  );
});

test("an .act table stops at its declared count", async () => {
  const bytes = new Uint8Array(772);
  bytes.set([255, 0, 0, 0, 255, 0, 0, 0, 255], 0);
  // The trailer says three of the 256 entries are real.
  bytes[768] = 0;
  bytes[769] = 3;

  const palette = await read(bytes, "table.act");
  assert.deepEqual(
    palette.colors.map((color) => to255(color.rgb)),
    [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ],
  );
});

test("an .act table without a trailer trims its black padding", async () => {
  const bytes = new Uint8Array(768);
  bytes.set([255, 0, 0, 0, 255, 0], 0);

  const palette = await read(bytes, "untrailered.act");
  assert.equal(palette.colors.length, 2);
});

test("an .aco file prefers the named block", async () => {
  const rgbEntry = (bytes: number[], r: number, g: number, b: number) => {
    writeUint16BE(bytes, 0); // RGB
    writeUint16BE(bytes, r * 257);
    writeUint16BE(bytes, g * 257);
    writeUint16BE(bytes, b * 257);
    writeUint16BE(bytes, 0);
  };

  const bytes: number[] = [];
  // Version 1 block: the colors, no names.
  writeUint16BE(bytes, 1);
  writeUint16BE(bytes, 2);
  rgbEntry(bytes, 255, 0, 0);
  rgbEntry(bytes, 0, 0, 255);
  // Version 2 block: the same colors, with names.
  writeUint16BE(bytes, 2);
  writeUint16BE(bytes, 2);
  ["Poppy", "Deep sea"].forEach((name, index) => {
    rgbEntry(bytes, index === 0 ? 255 : 0, 0, index === 0 ? 0 : 255);
    writeUint32BE(bytes, name.length + 1);
    name.split("").forEach((character) => writeUint16BE(bytes, character.charCodeAt(0)));
    writeUint16BE(bytes, 0);
  });

  const palette = await read(new Uint8Array(bytes), "swatches.aco");
  assert.deepEqual(
    palette.colors.map((color) => color.name),
    ["Poppy", "Deep sea"],
  );
  assert.deepEqual(
    palette.colors.map((color) => to255(color.rgb)),
    [
      [255, 0, 0],
      [0, 0, 255],
    ],
  );
});

test("an .aco file with only a version 1 block still imports", async () => {
  const bytes: number[] = [];
  writeUint16BE(bytes, 1);
  writeUint16BE(bytes, 1);
  writeUint16BE(bytes, 0);
  writeUint16BE(bytes, 128 * 257);
  writeUint16BE(bytes, 64 * 257);
  writeUint16BE(bytes, 32 * 257);
  writeUint16BE(bytes, 0);

  const palette = await read(new Uint8Array(bytes), "old.aco");
  assert.deepEqual(
    palette.colors.map((color) => to255(color.rgb)),
    [[128, 64, 32]],
  );
});

test("a file with nothing to import says so", async () => {
  await assert.rejects(() => read("nothing here", "empty.hex"), /No colors found/);
  await assert.rejects(() => read("whatever", "palette.psd"), /Unsupported palette format/);
});
