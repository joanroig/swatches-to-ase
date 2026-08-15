import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSharedPaletteUrl,
  decodeSharedPalette,
  encodeSharedPalette,
  parsePaletteHexSlug,
  takeSharedPaletteDetails,
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

test("buildSharedPaletteUrl uses a coolors-style hex slug", () => {
  ensureBase64Globals();
  const url = buildSharedPaletteUrl(samplePalette);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("import"), null);
  const slug = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
  assert.equal(slug, "ff8000-0099ff");
  assert.deepEqual(parsePaletteHexSlug(slug), ["FF8000", "0099FF"]);
});

test("a share URL carries the palette name and who sent it", () => {
  const palette = {
    id: "p1",
    name: "Sunset Ridge",
    lastModified: 0,
    colors: [
      { id: "c1", name: "Lagoon", rgb: [0, 0.666, 1] as [number, number, number] },
      { id: "c2", name: "Citrus", rgb: [0.949, 0.788, 0.298] as [number, number, number] },
    ],
  };

  const url = new URL(buildSharedPaletteUrl(palette, { id: "uid-123", name: "Joan" }));
  // The colors stay in the path, so the link still reads as a palette.
  assert.match(url.pathname, /00aaff-f2c94c$/i);
  assert.equal(url.searchParams.get("name"), "Sunset Ridge");
  assert.equal(url.searchParams.get("by"), "Joan");
  assert.equal(url.searchParams.get("uid"), "uid-123");

  const details = takeSharedPaletteDetails(url);
  assert.deepEqual(details, { name: "Sunset Ridge", authorName: "Joan", authorId: "uid-123" });
  // Read once and taken off, so they do not linger in the address bar after the import.
  assert.equal(url.search, "");
});

test("an anonymous share carries only what it has", () => {
  const palette = {
    id: "p1",
    name: "  ",
    lastModified: 0,
    colors: [{ id: "c1", name: "Lagoon", rgb: [0, 0.666, 1] as [number, number, number] }],
  };

  const url = new URL(buildSharedPaletteUrl(palette, null));
  assert.equal(url.search, "");
  assert.deepEqual(takeSharedPaletteDetails(url), { name: "", authorName: "", authorId: "" });
});

/* Someone else's link: a title long enough to run off the dialog gets cut. */
test("share details are capped", () => {
  const url = new URL(`https://example.com/00aaff?name=${"x".repeat(400)}`);
  assert.equal(takeSharedPaletteDetails(url).name.length, 120);
});
