import { applyActionLabels, setupActions } from "./app/actions";
import { renderDiscovery } from "./app/cloud/discovery";
import { syncCloudProfileForm } from "./app/cloud/profile";
import { refreshCloudControls, scheduleCloudSync, setupCloudAuth } from "./app/cloud/sync";
import { updateExportAvailability } from "./app/export/manager";
import { onLanguageChange } from "./app/i18n";
import { importSharedPaletteFromUrl, setupDropzone } from "./app/import";
import { hydratePalettes } from "./app/palette/storage";
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
import { setupTopbarShadow } from "./app/ui/topbar";
import { setupVersionBadge } from "./app/ui/version";

setPreferencesPayloadGetter(getPreferencesPayload);
setScheduleCloudSync(scheduleCloudSync);
setColorNotationChangeHandler(renderEditor);

setupFormatSelects();
setupColorNotationSelects();
setupDropzone();
setupVersionBadge();
setupTopbarShadow();
onLanguageChange(() => {
  applyActionLabels();
  refreshColorNotationSelects();
  renderPaletteList();
  renderEditor();
  renderViewModal();
  renderDiscovery();
  refreshCloudControls();
  syncCloudProfileForm();
});
hydratePreferences();
setupActions();
hydratePalettes();
syncPaletteColorNames();
setupCloudAuth();
importSharedPaletteFromUrl();
renderPaletteList();
renderEditor();
updateExportAvailability();
void waitForAppReady();
