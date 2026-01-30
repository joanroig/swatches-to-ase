import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSharedPaletteUrl,
  decodeSharedPalette,
  encodeSharedPalette,
} from "../../web/src/app/share.js";
import type { Palette } from "../../web/src/app/types.js";

const ensureBase64Globals = () => {
  const globalAny = globalThis as typeof globalThis & {
    btoa?: (data: string) => string;
    atob?: (data: string) => string;
  };
  if (!globalAny.btoa) {
    globalAny.btoa = (data) => Buffer.from(data, "binary").toString("base64");
  }
  if (!globalAny.atob) {
    globalAny.atob = (data) => Buffer.from(data, "base64").toString("binary");
  }
};

const samplePalette: Palette = {
  id: "palette-1",
  name: "Summer",
  colors: [
    { id: "color-1", name: "Sun", rgb: [1, 0.5, 0] },
    { id: "color-2", name: "Sea", rgb: [0, 0.6, 1] },
  ],
};

test("encode/decode shared palettes round-trip", () => {
  ensureBase64Globals();
  const encoded = encodeSharedPalette(samplePalette);
  const decoded = decodeSharedPalette(encoded);
  assert.ok(decoded);
  assert.equal(decoded?.name, "Summer");
  assert.deepEqual(decoded?.colors?.[0], { name: "Sun", hex: "FF8000" });
  assert.deepEqual(decoded?.colors?.[1], { name: "Sea", hex: "0099FF" });
});

test("decodeSharedPalette returns null for invalid input", () => {
  ensureBase64Globals();
  assert.equal(decodeSharedPalette("not-base64"), null);
});

test("buildSharedPaletteUrl embeds the encoded payload", () => {
  ensureBase64Globals();
  const url = buildSharedPaletteUrl(samplePalette);
  const parsed = new URL(url);
  const encodedParam = parsed.searchParams.get("import");
  assert.ok(encodedParam);
  const decoded = decodeSharedPalette(decodeURIComponent(encodedParam ?? ""));
  assert.equal(decoded?.name, "Summer");
});
