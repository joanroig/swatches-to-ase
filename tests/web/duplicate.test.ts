import assert from "node:assert/strict";
import { test } from "node:test";

import { duplicatePalette } from "../../web/src/app/palette/duplicate.js";
import type { Palette } from "../../web/src/app/types.js";

const sourcePalette: Palette = {
  id: "palette-1",
  name: "Summer",
  isPublic: true,
  publicId: "public-1",
  colors: [
    { id: "color-1", name: "Sun", rgb: [1, 0.5, 0] },
    { id: "color-2", name: "Sea", rgb: [0, 0.6, 1] },
  ],
};

test("duplicatePalette clones colors and resets ids/public flags", () => {
  const ids = ["palette-copy", "color-copy-1", "color-copy-2"];
  const copy = duplicatePalette(sourcePalette, ["Summer"], () => ids.shift() ?? "missing");

  assert.equal(copy.id, "palette-copy");
  assert.equal(copy.name, "Summer Copy");
  assert.equal(copy.colors.length, 2);
  assert.equal(copy.colors[0].id, "color-copy-1");
  assert.equal(copy.colors[1].id, "color-copy-2");
  assert.equal(copy.colors[0].name, "Sun");
  assert.deepEqual(copy.colors[0].rgb, [1, 0.5, 0]);
  assert.equal(copy.isPublic, false);
  assert.equal(copy.publicId, undefined);
});

test("duplicatePalette increments copy suffix when needed", () => {
  const copy = duplicatePalette(
    { id: "palette-2", name: "Moody Copy 2", colors: [] },
    ["Moody Copy", "Moody Copy 2", "Moody Copy 3"],
    () => "palette-copy-2",
  );

  assert.equal(copy.name, "Moody Copy 4");
});
