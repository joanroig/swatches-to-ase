import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSyncPayload, parseSyncPayload } from "../../web/src/app/cloud/serializer.js";
import type { Palette, Preferences } from "../../web/src/app/types.js";

const samplePalette: Palette = {
  id: "palette-1",
  name: "Cloud palette",
  colors: [
    { id: "color-1", name: "Sky", rgb: [0.2, 0.4, 0.9] },
    { id: "color-2", name: "Sun", rgb: [1, 0.7, 0.2] },
  ],
  isPublic: true,
  publicId: "public-1",
};

const samplePreferences: Preferences = {
  theme: "studio",
  colorNameFormat: "pantone",
  addBlackWhite: false,
  exportFormat: "all",
  colorNotation: "hex",
  generateStyle: "shade",
};

test("buildSyncPayload includes palettes, preferences, and revision", () => {
  const payload = buildSyncPayload([samplePalette], [], "palette-1", samplePreferences);
  assert.equal(payload.activePaletteId, "palette-1");
  assert.equal(payload.palettes[0].name, "Cloud palette");
  assert.equal(payload.preferences.theme, "studio");
  assert.ok(payload.revision);
});

test("parseSyncPayload validates a sync payload", () => {
  const payload = buildSyncPayload([samplePalette], [], "palette-1", samplePreferences);
  const parsed = parseSyncPayload(payload);
  assert.ok(parsed);
  assert.equal(parsed?.palettes[0].publicId, "public-1");
});

test("parseSyncPayload returns null for invalid input", () => {
  const parsed = parseSyncPayload({ bad: true });
  assert.equal(parsed, null);
});
