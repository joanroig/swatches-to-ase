import assert from "node:assert/strict";
import { test } from "node:test";

import {
  folderLibraryKey,
  mergeVisibleLibraryOrder,
  paletteLibraryKey,
  reconcileLibraryOrder,
} from "../../web/src/app/palette/library-order.js";
import type { Folder, Palette } from "../../web/src/app/types.js";

const palette = (id: string, folderId: string | null = null): Palette => ({ id, name: id, colors: [], folderId });
const folder = (id: string): Folder => ({ id, name: id });

test("legacy libraries migrate to folders first without losing items", () => {
  assert.deepEqual(reconcileLibraryOrder([], [palette("p1"), palette("filed", "f1")], [folder("f1")]), [
    folderLibraryKey("f1"),
    paletteLibraryKey("p1"),
  ]);
});

test("mixed folder and palette order is preserved and stale keys are removed", () => {
  const order = [paletteLibraryKey("p1"), "folder:gone", folderLibraryKey("f1"), paletteLibraryKey("p2")];
  assert.deepEqual(reconcileLibraryOrder(order, [palette("p1"), palette("p2")], [folder("f1")]), [
    paletteLibraryKey("p1"),
    folderLibraryKey("f1"),
    paletteLibraryKey("p2"),
  ]);
});

test("reordering visible results leaves filtered-out items in their slots", () => {
  const hidden = paletteLibraryKey("hidden");
  const first = paletteLibraryKey("first");
  const last = folderLibraryKey("last");
  assert.deepEqual(mergeVisibleLibraryOrder([first, hidden, last], [last, first]), [last, hidden, first]);
});

test("a palette arriving from a folder is inserted beside its visible neighbour", () => {
  const folderKey = folderLibraryKey("f1");
  const paletteKey = paletteLibraryKey("p1");
  assert.deepEqual(mergeVisibleLibraryOrder([folderKey], [paletteKey, folderKey]), [paletteKey, folderKey]);
});
