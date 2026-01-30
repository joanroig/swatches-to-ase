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

const readUint16BE = (view: DataView, offset: number) =>
  view.getUint16(offset, false);
const readUint32BE = (view: DataView, offset: number) =>
  view.getUint32(offset, false);
const readFloat32BE = (view: DataView, offset: number) =>
  view.getFloat32(offset, false);

const readAscii = (view: DataView, offset: number, length: number) => {
  let text = "";
  for (let i = 0; i < length; i += 1) {
    text += String.fromCharCode(view.getUint8(offset + i));
  }
  return text;
};

const readUtf16be = (view: DataView, offset: number, length: number) => {
  let text = "";
  for (let i = 0; i < length; i += 1) {
    const codeUnit = view.getUint16(offset + i * 2, false);
    if (codeUnit === 0x0000) {
      break;
    }
    text += String.fromCharCode(codeUnit);
  }
  return text;
};

export const decodeAse = (data: ArrayBuffer | Uint8Array) => {
  const view =
    data instanceof Uint8Array
      ? new DataView(data.buffer, data.byteOffset, data.byteLength)
      : new DataView(data);
  const byteLength = view.byteLength;
  const signature = readAscii(view, 0, 4);
  if (signature !== "ASEF") {
    throw new Error("Invalid ASE file.");
  }

  let offset = 12;
  const colors: Array<{ name: string; model: string; color: number[] }> = [];
  const blockCount = readUint32BE(view, 8);
  const warnMalformed = (message: string) => {
    console.warn(`ASE parse warning: ${message}`);
  };

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    if (offset + 6 > byteLength) {
      warnMalformed("Unexpected end of file while reading block header.");
      break;
    }
    const blockType = readUint16BE(view, offset);
    offset += 2;
    const blockLength = readUint32BE(view, offset);
    offset += 4;
    const blockEnd = offset + blockLength;
    if (blockEnd > byteLength) {
      warnMalformed("Block length exceeds remaining file size.");
      break;
    }

    if (blockType === 0xc002) {
      offset = blockEnd;
      continue;
    }

    let cursor = offset;
    if (cursor + 2 > blockEnd) {
      warnMalformed("Missing name length in block.");
      offset = blockEnd;
      continue;
    }
    const nameLength = readUint16BE(view, cursor);
    cursor += 2;
    const nameBytes = nameLength * 2;
    if (cursor + nameBytes > blockEnd) {
      warnMalformed("Name length exceeds block size.");
      offset = blockEnd;
      continue;
    }
    const name = readUtf16be(view, cursor, nameLength);
    cursor += nameBytes;

    if (blockType === 0xc001) {
      offset = blockEnd;
      continue;
    }

    if (cursor + 4 > blockEnd) {
      warnMalformed("Missing color model in block.");
      offset = blockEnd;
      continue;
    }
    const model = readAscii(view, cursor, 4).trim();
    cursor += 4;
    const modelKey = model.toUpperCase();
    const channelCount =
      modelKey === "CMYK" ? 4 : modelKey === "GRAY" ? 1 : 3;
    const color: number[] = [];
    const channelBytes = channelCount * 4;
    if (cursor + channelBytes > blockEnd) {
      warnMalformed("Color channels exceed block size.");
      offset = blockEnd;
      continue;
    }
    for (let i = 0; i < channelCount; i += 1) {
      color.push(readFloat32BE(view, cursor));
      cursor += 4;
    }
    if (cursor + 2 > blockEnd) {
      warnMalformed("Missing color type in block.");
      offset = blockEnd;
      continue;
    }
    readUint16BE(view, cursor);
    cursor += 2;

    colors.push({ name, model, color });
    offset = blockEnd;
  }

  return { colors };
};
