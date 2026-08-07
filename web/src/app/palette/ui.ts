/**
 * Public surface of the palette UI.
 *
 * The implementation lives in focused modules:
 *   - `list.ts`           library cards, publishing, deletion, card reordering
 *   - `editor.ts`         the edit modal, colour rows, colour reordering, layout toggle
 *   - `view.ts`           the quick-view modal for local and Discover palettes
 *   - `editor-session.ts` undo / redo / dirty tracking for an editing session
 *   - `mutations.ts`      state changes shared by all of the above
 */

export { openEditorForPalette, renderEditor, setupEditorLayout, syncEditorLayout } from "./editor";
export {
  cancelEditorChanges,
  confirmEditorClose,
  redoEditorChange,
  saveEditorChanges,
  undoEditorChange,
} from "./editor-session";
export { removePalette, renderPaletteList, togglePaletteVisibility } from "./list";
export {
  getPaletteById,
  moveColorToIndex,
  movePaletteToIndex,
  syncActivePalette,
  syncPaletteColorNames,
  updatePalette,
  updatePaletteName,
} from "./mutations";
export { openViewForPalette, openViewForPublicPalette, renderViewModal } from "./view";
