import { applyActionLabels, setupActions } from "./app/actions";
import {
  prefetchCloud,
  refreshCloudControls,
  renderDiscovery,
  scheduleCloudSync,
  setupCloudAuth,
  syncCloudProfileForm,
} from "./app/cloud/lazy";
import { updateExportAvailability } from "./app/export/manager";
import { onLanguageChange } from "./app/i18n";
import { setupImageImport } from "./app/image/importer";
import { importSharedPaletteFromUrl, setupDropzone } from "./app/import";
import { hydratePalettes } from "./app/palette/storage";
import { refreshPlayground, setupPlayground } from "./app/playground/ui";
import { renderEditor, renderPaletteList, renderViewModal, syncPaletteColorNames } from "./app/palette/ui";
import { setPreferencesPayloadGetter, setScheduleCloudSync } from "./app/persistence";
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
  renderDiscovery();
  refreshCloudControls();
  syncCloudProfileForm();
  refreshPlayground();
});
hydratePreferences();
// After preferences: the working set is named with the active colour-naming format.
setupPlayground();
setupActions();
hydratePalettes();
syncPaletteColorNames();
setupCloudAuth();
importSharedPaletteFromUrl();
renderPaletteList();
renderEditor();
updateExportAvailability();
void waitForAppReady().then(() => {
  // Warm the Firebase chunk once the app has painted, so the first cloud action is not also a
  // 370 kB download. Deliberately after `waitForAppReady`, never before it.
  prefetchCloud();
});
