import { setupActions } from "./app/actions";
import {
  getPreferencesPayload,
  hydratePreferences,
  setColorNotationChangeHandler,
  setupColorNotationSelects,
  setupFormatSelects,
} from "./app/preferences";
import { hydratePalettes } from "./app/palette/storage";
import { renderEditor, renderPaletteList } from "./app/palette/ui";
import { updateExportAvailability } from "./app/export/manager";
import { waitForAppReady } from "./app/ui/ready";
import { setupVersionBadge } from "./app/ui/version";
import { importSharedPaletteFromUrl, setupDropzone } from "./app/import";
import { scheduleCloudSync, setupCloudAuth } from "./app/cloud/sync";
import {
  setPreferencesPayloadGetter,
  setScheduleCloudSync,
} from "./app/persistence";

setPreferencesPayloadGetter(getPreferencesPayload);
setScheduleCloudSync(scheduleCloudSync);
setColorNotationChangeHandler(renderEditor);

setupFormatSelects();
setupColorNotationSelects();
setupDropzone();
setupVersionBadge();
setupActions();
hydratePreferences();
hydratePalettes();
setupCloudAuth();
importSharedPaletteFromUrl();
renderPaletteList();
renderEditor();
updateExportAvailability();
void waitForAppReady();
