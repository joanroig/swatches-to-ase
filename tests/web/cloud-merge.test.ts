import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaletteFingerprint,
  clonePalette,
  mergePalettes,
  palettesEquivalent,
  resolveMergedActivePaletteId,
} from "../../web/src/app/cloud/merge.js";
import type { Palette } from "../../web/src/app/types.js";

const palette = (id: string, name: string, rgb: [number, number, number], lastModified = 1000): Palette => ({
  id,
  name,
  colors: [{ id: `${id}-c0`, name: "c", rgb }],
  lastModified,
});

test("clonePalette copies the colour tuples rather than sharing them", () => {
  const original = palette("a", "One", [0.1, 0.2, 0.3]);
  const copy = clonePalette(original);
  copy.colors[0].rgb[0] = 0.9;
  assert.equal(original.colors[0].rgb[0], 0.1);
});

test("the fingerprint ignores ids and tracks name plus colours", () => {
  assert.equal(
    buildPaletteFingerprint(palette("a", "One", [0.1, 0.2, 0.3])),
    buildPaletteFingerprint(palette("b", "One", [0.1, 0.2, 0.3])),
  );
  assert.notEqual(
    buildPaletteFingerprint(palette("a", "One", [0.1, 0.2, 0.3])),
    buildPaletteFingerprint(palette("a", "Two", [0.1, 0.2, 0.3])),
  );
});

test("a local-only palette is carried into the merge", () => {
  const merged = mergePalettes([palette("local", "Local", [0, 0, 1])], [palette("remote", "Remote", [1, 0, 0])]);
  assert.deepEqual(
    merged.map((entry) => entry.id),
    ["remote", "local"],
  );
});

test("a local duplicate of a remote palette is dropped", () => {
  // Same name and colours, different id: this is the same palette that synced under another id.
  const merged = mergePalettes([palette("local", "Shared", [0, 0, 1])], [palette("remote", "Shared", [0, 0, 1])]);
  assert.deepEqual(
    merged.map((entry) => entry.id),
    ["remote"],
  );
});

test("a conflicting edit keeps both copies, the local one as a backup", () => {
  const merged = mergePalettes([palette("same", "Mine", [0, 0, 1], 2000)], [palette("same", "Theirs", [1, 0, 0], 1000)]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].name, "Theirs");
  assert.equal(merged[1].name, "(BACKUP) Mine");
  // The backup must not claim the original id, or it would overwrite the remote copy on next sync.
  assert.notEqual(merged[1].id, "same");
  assert.equal(merged[1].isPublic, false);
  assert.equal(merged[1].publicId, null);
});

test("an identical timestamp is not a conflict", () => {
  const merged = mergePalettes([palette("same", "Mine", [0, 0, 1], 1000)], [palette("same", "Theirs", [1, 0, 0], 1000)]);
  assert.equal(merged.length, 1);
});

test("palettesEquivalent compares ids and timestamps, not order", () => {
  const left = [palette("a", "A", [0, 0, 0], 1), palette("b", "B", [0, 0, 0], 2)];
  const right = [palette("b", "B", [0, 0, 0], 2), palette("a", "A", [0, 0, 0], 1)];
  assert.equal(palettesEquivalent(left, right), true);
  assert.equal(palettesEquivalent(left, [palette("a", "A", [0, 0, 0], 1)]), false);
  assert.equal(palettesEquivalent(left, [left[0], palette("b", "B", [0, 0, 0], 3)]), false);
});

test("the active palette falls back from remote to local to the first survivor", () => {
  const palettes = [palette("a", "A", [0, 0, 0]), palette("b", "B", [0, 0, 0])];
  assert.equal(resolveMergedActivePaletteId("b", "a", palettes), "b");
  assert.equal(resolveMergedActivePaletteId("gone", "a", palettes), "a");
  assert.equal(resolveMergedActivePaletteId("gone", "also-gone", palettes), "a");
  assert.equal(resolveMergedActivePaletteId(null, null, []), null);
});
