import { PALETTES_KEY, STORAGE_KEY } from "./config";
import { cloudState, state } from "./state";
import type { Preferences } from "./types";

let scheduleCloudSync: (() => void) | null = null;
let getPreferencesPayload: (() => Preferences) | null = null;

export const setScheduleCloudSync = (handler: (() => void) | null) => {
  scheduleCloudSync = handler;
};

export const setPreferencesPayloadGetter = (getter: (() => Preferences) | null) => {
  getPreferencesPayload = getter;
};

export const persistPreferences = () => {
  if (!getPreferencesPayload) {
    return;
  }
  const payload = getPreferencesPayload();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  if (!cloudState.applyingRemote) {
    scheduleCloudSync?.();
  }
};

export const persistPalettes = () => {
  const payload = {
    palettes: state.palettes,
    activePaletteId: state.activePaletteId,
  };
  localStorage.setItem(PALETTES_KEY, JSON.stringify(payload));
  if (!cloudState.applyingRemote) {
    scheduleCloudSync?.();
  }
};
