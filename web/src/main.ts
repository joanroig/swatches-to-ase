import { applyActionLabels, setupActions } from "./app/actions";
import { hasRememberedCloudSession } from "./app/cloud/config";
import { prefetchCloud, refreshLoadedCloudUi, scheduleCloudSync } from "./app/cloud/lazy";
import { updateExportAvailability } from "./app/export/manager";
import { onLanguageChange } from "./app/i18n";
import { setupImageImport } from "./app/image/importer";
import { importSharedPaletteFromUrl, setupDropzone } from "./app/import";
import { restoreCollapsedFolders } from "./app/palette/folders";
import { hydratePalettes } from "./app/palette/storage";
import { renderEditor, renderPaletteList, renderViewModal, syncPaletteColorNames } from "./app/palette/ui";
import { setPreferencesPayloadGetter, setScheduleCloudSync } from "./app/persistence";
import { refreshPlayground, setupPlayground } from "./app/playground/ui";
import {
  getPreferencesPayload,
  hydratePreferences,
  refreshColorNotationSelects,
  setColorNotationChangeHandler,
  setupColorNotationSelects,
  setupFormatSelects,
} from "./app/preferences";
import { waitForAppReady } from "./app/ui/ready";
import { setupShell } from "./app/ui/shell";
import { setupTopbarShadow } from "./app/ui/topbar";
import { setupVersionBadge } from "./app/ui/version";

setPreferencesPayloadGetter(getPreferencesPayload);
setScheduleCloudSync(scheduleCloudSync);
setColorNotationChangeHandler(renderEditor);

setupFormatSelects();
setupColorNotationSelects();
setupDropzone();
setupImageImport();
setupVersionBadge();
setupTopbarShadow();
setupShell();
onLanguageChange(() => {
  applyActionLabels();
  refreshColorNotationSelects();
  renderPaletteList();
  renderEditor();
  renderViewModal();
  refreshLoadedCloudUi();
  refreshPlayground();
});
hydratePreferences();
// After preferences: the working set is named with the active color-naming format.
setupPlayground();
setupActions();
restoreCollapsedFolders();
hydratePalettes();
syncPaletteColorNames();
importSharedPaletteFromUrl();
renderPaletteList();
renderEditor();
updateExportAvailability();
void waitForAppReady().then(() => {
  if (hasRememberedCloudSession()) {
    prefetchCloud();
  }
});
