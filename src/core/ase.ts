export type AseColorType = "global" | "spot" | "normal";

export type AseColor = {
  name: string;
  rgb: [number, number, number];
  type?: AseColorType;
};

const COLOR_TYPE_CODES: Record<AseColorType, number> = {
  global: 0,
  spot: 1,
  normal: 2,
};

const ASE_HEADER = [0x41, 0x53, 0x45, 0x46]; // "ASEF"

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

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const encodeAse = (colors: AseColor[]) => {
  const bytes: number[] = [];
  bytes.push(...ASE_HEADER);
  writeUint16BE(bytes, 1);
  writeUint16BE(bytes, 0);
  writeUint32BE(bytes, colors.length);

  for (const color of colors) {
    const block: number[] = [];
    const safeName = color.name || "untitled";
    const nameLength = safeName.length + 1;
    writeUint16BE(block, nameLength);
    block.push(...encodeUtf16be(safeName));
    block.push(0x00, 0x00);
    writeAscii4(block, "RGB ");
    const [r, g, b] = color.rgb;
    writeFloat32BE(block, clamp(r, 0, 1));
    writeFloat32BE(block, clamp(g, 0, 1));
    writeFloat32BE(block, clamp(b, 0, 1));
    const type = color.type ?? "global";
    writeUint16BE(block, COLOR_TYPE_CODES[type] ?? 0);

    writeUint16BE(bytes, 0x0001);
    writeUint32BE(bytes, block.length);
    bytes.push(...block);
  }

  return new Uint8Array(bytes);
};
