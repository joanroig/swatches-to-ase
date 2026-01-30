import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeAse, encodeAse } from "../../src/core/ase.js";

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

const makeGroupBlock = (name: string) => {
  const block: number[] = [];
  const nameLength = name.length + 1;
  writeUint16BE(block, nameLength);
  block.push(...encodeUtf16be(name));
  block.push(0x00, 0x00);
  block.push(0x00, 0x00, 0x00, 0x00);

  const bytes: number[] = [];
  writeUint16BE(bytes, 0xc001);
  writeUint32BE(bytes, block.length);
  bytes.push(...block);
  return bytes;
};

const makeGroupEndBlock = () => {
  const bytes: number[] = [];
  writeUint16BE(bytes, 0xc002);
  writeUint32BE(bytes, 0);
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

test("encodeAse clamps values and defaults names", () => {
  const encoded = encodeAse([
    { name: "", rgb: [2.5, -1, 0.5], type: "spot" },
  ]);
  const decoded = decodeAse(encoded);
  assert.equal(decoded.colors?.length, 1);
  const [entry] = decoded.colors ?? [];
  assert.equal(entry.name, "untitled");
  assert.equal(entry.model.trim(), "RGB");
  assert.ok(entry.color[0] <= 1 && entry.color[0] >= 0);
  assert.ok(entry.color[1] <= 1 && entry.color[1] >= 0);
  assert.equal(entry.color[2], 0.5);
});

test("decodeAse skips group blocks and handles custom models", () => {
  const data = buildAse([
    makeGroupBlock("Group"),
    makeColorBlock("Ink", "CMYK", [0.1, 0.2, 0.3, 0.4], 1),
    makeGroupEndBlock(),
  ]);
  const decoded = decodeAse(data);
  assert.equal(decoded.colors?.length, 1);
  assert.equal(decoded.colors?.[0]?.name, "Ink");
  assert.equal(decoded.colors?.[0]?.model, "CMYK");
});

test("decodeAse rejects invalid headers", () => {
  const invalid = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
  assert.throws(() => decodeAse(invalid), /Invalid ASE file/);
});
