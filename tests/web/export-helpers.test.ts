import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getPaletteHexes,
  selectExportTargets,
  selectPrimaryExportPalette,
} from "../../web/src/app/export/helpers.js";
import type { Palette } from "../../web/src/app/types.js";

const paletteA: Palette = {
  id: "palette-a",
  name: "Warm",
  colors: [
    { id: "c1", name: "Red", rgb: [1, 0, 0] },
    { id: "c2", name: "Green", rgb: [0, 1, 0] },
  ],
};

const paletteB: Palette = {
  id: "palette-b",
  name: "Cool",
  colors: [{ id: "c3", name: "Blue", rgb: [0, 0, 1] }],
};

test("selectExportTargets returns the active palette in single mode", () => {
  const targets = selectExportTargets("single", [paletteA, paletteB], "palette-b");
  assert.equal(targets.length, 1);
  assert.equal(targets[0].id, "palette-b");
});

test("selectExportTargets falls back to the first palette", () => {
  const targets = selectExportTargets("single", [paletteA, paletteB], null);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].id, "palette-a");
});

test("selectExportTargets returns all palettes in batch mode", () => {
  const palettes = [paletteA, paletteB];
  const targets = selectExportTargets("batch", palettes, "palette-b");
  assert.equal(targets.length, 2);
  assert.notEqual(targets, palettes);
  assert.equal(targets[0].id, "palette-a");
  assert.equal(targets[1].id, "palette-b");
});

test("selectPrimaryExportPalette prefers active when multiple targets", () => {
  const targets = [paletteA, paletteB];
  const primary = selectPrimaryExportPalette(targets, targets, "palette-b");
  assert.equal(primary?.id, "palette-b");
});

test("selectPrimaryExportPalette falls back to first target", () => {
  const targets = [paletteA, paletteB];
  const primary = selectPrimaryExportPalette(targets, targets, "missing");
  assert.equal(primary?.id, "palette-a");
});

test("getPaletteHexes returns lowercase hex without prefix", () => {
  const hexes = getPaletteHexes(paletteA);
  assert.deepEqual(hexes, ["ff0000", "00ff00"]);
});
