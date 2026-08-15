import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaletteFingerprint,
  clonePalette,
  mergeFolders,
  mergeLibraries,
  mergePalettes,
  palettesEquivalent,
  resolveMergedActivePaletteId,
} from "../../web/src/app/cloud/merge.js";
import type { Folder, Palette } from "../../web/src/app/types.js";

const palette = (
  id: string,
  name: string,
  rgb: [number, number, number],
  lastModified = 1000,
  folderId: string | null = null,
): Palette => ({
  id,
  name,
  colors: [{ id: `${id}-c0`, name: "c", rgb }],
  lastModified,
  folderId,
});

const folder = (id: string, name: string): Folder => ({ id, name });

test("clonePalette copies the color tuples rather than sharing them", () => {
  const original = palette("a", "One", [0.1, 0.2, 0.3]);
  const copy = clonePalette(original);
  copy.colors[0].rgb[0] = 0.9;
  assert.equal(original.colors[0].rgb[0], 0.1);
});

test("the fingerprint ignores ids and tracks name plus colors", () => {
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
  // Same name and colors, different id: this is the same palette that synced under another id.
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

/* ------------------------------------------------------------------ folders --- */

test("folders with the same name are treated as one, and the remote keeps its id", () => {
  const { folders, remap } = mergeFolders([folder("local-1", "Brand")], [folder("remote-1", "Brand")]);
  assert.deepEqual(
    folders.map((entry) => entry.id),
    ["remote-1"],
  );
  assert.equal(remap.get("local-1"), "remote-1");
});

test("folder names match case- and whitespace-insensitively", () => {
  const { folders } = mergeFolders([folder("local-1", "  brand ")], [folder("remote-1", "Brand")]);
  assert.equal(folders.length, 1);
});

test("a local-only folder survives the merge", () => {
  const { folders, remap } = mergeFolders([folder("local-1", "Scratch")], [folder("remote-1", "Brand")]);
  assert.deepEqual(
    folders.map((entry) => entry.name),
    ["Brand", "Scratch"],
  );
  assert.equal(remap.get("local-1"), "local-1");
});

test("a palette in a same-named local folder follows it to the remote folder", () => {
  const merged = mergeLibraries(
    {
      palettes: [palette("p1", "Mine", [0, 0, 1], 1000, "local-1")],
      folders: [folder("local-1", "Brand")],
      libraryOrder: [],
    },
    { palettes: [], folders: [folder("remote-1", "Brand")], libraryOrder: [] },
  );
  assert.equal(merged.palettes[0].folderId, "remote-1");
  assert.deepEqual(
    merged.folders.map((entry) => entry.id),
    ["remote-1"],
  );
});

test("a palette in a local-only folder stays filed there", () => {
  const merged = mergeLibraries(
    {
      palettes: [palette("p1", "Mine", [0, 0, 1], 1000, "local-1")],
      folders: [folder("local-1", "Scratch")],
      libraryOrder: [],
    },
    { palettes: [], folders: [], libraryOrder: [] },
  );
  assert.equal(merged.palettes[0].folderId, "local-1");
  assert.equal(merged.folders.length, 1);
});

test("a palette pointing at a folder that did not survive falls back to Drafts, not out of view", () => {
  // The regression this guards: `folderId` used to keep an id no longer in `folders`, and such a
  // palette matches neither a folder group nor the unfiled group, so it vanished from the library.
  const merged = mergeLibraries(
    { palettes: [palette("p1", "Orphan", [0, 0, 1], 1000, "ghost")], folders: [], libraryOrder: [] },
    { palettes: [], folders: [], libraryOrder: [] },
  );
  assert.equal(merged.palettes[0].folderId, null);
});

test("every merged palette resolves to a real folder or to none", () => {
  const merged = mergeLibraries(
    {
      palettes: [
        palette("p1", "A", [0, 0, 1], 1000, "local-1"),
        palette("p2", "B", [0, 1, 0], 1000, "local-2"),
        palette("p3", "C", [1, 0, 0], 1000, "ghost"),
      ],
      folders: [folder("local-1", "Brand"), folder("local-2", "Scratch")],
      libraryOrder: [],
    },
    { palettes: [palette("r1", "Remote", [1, 1, 0])], folders: [folder("remote-1", "brand")], libraryOrder: [] },
  );
  const known = new Set(merged.folders.map((entry) => entry.id));
  merged.palettes.forEach((entry) => {
    assert.ok(entry.folderId === null || known.has(entry.folderId), `${entry.name} points at a missing folder`);
  });
  assert.equal(merged.palettes.find((entry) => entry.name === "A")?.folderId, "remote-1");
  assert.equal(merged.palettes.find((entry) => entry.name === "C")?.folderId, null);
});

test("a backup keeps the folder its original was in", () => {
  const merged = mergeLibraries(
    {
      palettes: [palette("same", "Mine", [0, 0, 1], 2000, "local-1")],
      folders: [folder("local-1", "Brand")],
      libraryOrder: [],
    },
    {
      palettes: [palette("same", "Theirs", [1, 0, 0], 1000, "remote-1")],
      folders: [folder("remote-1", "Brand")],
      libraryOrder: [],
    },
  );
  const backup = merged.palettes.find((entry) => entry.name.startsWith("(BACKUP)"));
  assert.equal(backup?.folderId, "remote-1");
});

/*
 * Folders left standing with nothing in them.
 *
 * The complaint was empty collections appearing after signing in. They came from a palette that
 * exists on both sides under different ids: the local copy is dropped as a duplicate, and the
 * folder it was filed in survives holding nothing.
 */
test("a folder emptied by the merge is dropped", () => {
  const merged = mergeLibraries(
    {
      palettes: [palette("local-p", "Shared", [0, 0, 1], 1000, "local-1")],
      folders: [folder("local-1", "Scratch")],
      libraryOrder: [],
    },
    // Same name and colors, different id: a duplicate, so the local copy does not survive.
    { palettes: [palette("remote-p", "Shared", [0, 0, 1], 2000)], folders: [], libraryOrder: [] },
  );
  assert.equal(merged.palettes.length, 1);
  assert.deepEqual(merged.folders, []);
  assert.deepEqual(merged.libraryOrder, ["palette:remote-p"]);
});

test("a folder that was already empty is kept", () => {
  // Making a folder before there is anything to put in it is a normal way to start, on either side.
  const merged = mergeLibraries(
    { palettes: [], folders: [folder("local-1", "Scratch")], libraryOrder: [] },
    { palettes: [], folders: [folder("remote-1", "Brand")], libraryOrder: [] },
  );
  assert.deepEqual(merged.folders.map((entry) => entry.name).sort(), ["Brand", "Scratch"]);
});

test("a folder that still holds something survives", () => {
  const merged = mergeLibraries(
    {
      palettes: [palette("p1", "Mine", [0, 0, 1], 1000, "local-1")],
      folders: [folder("local-1", "Scratch")],
      libraryOrder: [],
    },
    { palettes: [palette("r1", "Theirs", [1, 0, 0], 1000)], folders: [], libraryOrder: [] },
  );
  assert.deepEqual(
    merged.folders.map((entry) => entry.id),
    ["local-1"],
  );
  assert.equal(merged.palettes.find((entry) => entry.name === "Mine")?.folderId, "local-1");
});
