import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

import {
  cloudSignInButton,
  cloudSignOutButton,
  cloudStatus,
  cloudSyncButton,
} from "../dom";
import { cloudState, discoveryState, state } from "../state";
import type { CloudUser } from "../types";
import { buildSyncPayload, parseSyncPayload } from "./serializer";
import { applyRemotePreferences, getPreferencesPayload } from "../preferences";
import { persistPalettes, persistPreferences } from "../persistence";
import { renderEditor, renderPaletteList } from "../palette/ui";
import { updateExportAvailability } from "../export/manager";
import { showToast } from "../ui/notifications";
import { firebaseClient, firebaseConfigStatus } from "./context";
import { upsertPublicPalette } from "./public";
import { fetchUserInteractions, renderDiscovery } from "./discovery";
import { renderCloudUserCard } from "./user-card";
import { syncCloudProfileForm } from "./profile";

let cloudUnsubscribe: (() => void) | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

const formatSyncTimestamp = (value: string | null) => {
  if (!value) {
    return "Not synced yet";
  }
  return `Last synced at ${value}`;
};

const setCloudStatusMessage = (message: string) => {
  if (cloudStatus) {
    cloudStatus.textContent = message;
  }
};

const updateCloudControls = () => {
  if (!cloudState.isConfigured) {
    const missing = firebaseConfigStatus.missingKeys.join(", ");
    setCloudStatusMessage(
      `Firebase keys missing: ${missing}. Add them to enable sync.`
    );
  } else if (!cloudState.user) {
    setCloudStatusMessage("Sign in to sync palettes between devices.");
  } else if (cloudState.isSyncing) {
    setCloudStatusMessage("Syncing palettes to the cloud...");
  } else {
    setCloudStatusMessage(formatSyncTimestamp(cloudState.lastSyncedAt));
  }

  if (cloudSignInButton) {
    cloudSignInButton.disabled = !cloudState.isConfigured || !!cloudState.user;
  }
  if (cloudSignOutButton) {
    cloudSignOutButton.disabled = !cloudState.user;
  }
  if (cloudSyncButton) {
    cloudSyncButton.disabled = !cloudState.user || cloudState.isSyncing;
  }

  renderCloudUserCard();
};

const applyRemoteState = (payload: ReturnType<typeof parseSyncPayload>) => {
  if (!payload) {
    return;
  }
  cloudState.applyingRemote = true;
  cloudState.lastRevision = payload.revision;
  state.palettes = payload.palettes;
  state.activePaletteId = payload.activePaletteId;
  applyRemotePreferences(payload.preferences);
  persistPreferences();
  persistPalettes();
  renderPaletteList();
  renderEditor();
  updateExportAvailability();
  cloudState.applyingRemote = false;
};

const listenToCloudState = () => {
  if (!firebaseClient || !cloudState.user) {
    return;
  }
  if (cloudUnsubscribe) {
    cloudUnsubscribe();
  }
  let handledEmpty = false;
  cloudUnsubscribe = onSnapshot(
    doc(firebaseClient.db, "users", cloudState.user.uid, "state", "app"),
    (snapshot) => {
      if (!snapshot.exists()) {
        if (!handledEmpty) {
          handledEmpty = true;
          void syncToCloud();
        }
        return;
      }
      handledEmpty = true;
      const payload = parseSyncPayload(snapshot.data());
      if (!payload || payload.revision === cloudState.lastRevision) {
        return;
      }
      applyRemoteState(payload);
      cloudState.lastSyncedAt = new Date().toLocaleTimeString();
      updateCloudControls();
    }
  );
};

export const syncToCloud = async () => {
  if (!firebaseClient || !cloudState.user) {
    return;
  }
  cloudState.isSyncing = true;
  updateCloudControls();
  const payload = buildSyncPayload(
    state.palettes,
    state.activePaletteId,
    getPreferencesPayload()
  );
  cloudState.lastRevision = payload.revision;
  try {
    await setDoc(
      doc(firebaseClient.db, "users", cloudState.user.uid, "state", "app"),
      { ...payload, updatedAt: serverTimestamp() },
      { merge: true }
    );
    await Promise.all(
      payload.palettes
        .filter((palette) => palette.isPublic)
        .map((palette) => upsertPublicPalette(palette))
    );
    cloudState.lastSyncedAt = new Date().toLocaleTimeString();
  } catch (error) {
    console.error(error);
    showToast("Cloud sync failed. Check your connection.", "error");
  } finally {
    cloudState.isSyncing = false;
    updateCloudControls();
  }
};

export const scheduleCloudSync = () => {
  if (!firebaseClient || !cloudState.user) {
    return;
  }
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncToCloud();
  }, 700);
};

export const setupCloudAuth = () => {
  updateCloudControls();
  if (!firebaseClient) {
    return;
  }
  onAuthStateChanged(firebaseClient.auth, async (user) => {
    cloudState.user = user
      ? ({
          uid: user.uid,
          name: user.displayName ?? "Palette Studio user",
          email: user.email,
          photoUrl: user.photoURL,
        } as CloudUser)
      : null;
    cloudState.lastSyncedAt = null;
    updateCloudControls();
    syncCloudProfileForm();
    renderPaletteList();
    if (cloudUnsubscribe) {
      cloudUnsubscribe();
      cloudUnsubscribe = null;
    }
    if (!cloudState.user) {
      discoveryState.likedIds.clear();
      discoveryState.savedIds.clear();
      renderDiscovery();
      return;
    }
    await fetchUserInteractions();
    listenToCloudState();
  });
};
