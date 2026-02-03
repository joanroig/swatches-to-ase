import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import {
  cloudEmailInput,
  cloudEmailSignInButton,
  cloudEmailSignUpButton,
  cloudPasswordInput,
  cloudAuthSection,
  cloudProfileSection,
  cloudSessionActions,
  cloudSignInButton,
  cloudSignOutButton,
  cloudStatus,
  cloudSyncButton,
} from "../dom";
import { t } from "../i18n";
import { renderPaletteList, syncPaletteColorNames } from "../palette/ui";
import { persistPreferences } from "../persistence";
import { applyRemotePreferences, getPreferencesPayload } from "../preferences";
import { cloudState, discoveryState, state } from "../state";
import type { CloudUser } from "../types";
import { showToast } from "../ui/notifications";
import { firebaseClient, firebaseConfigStatus } from "./context";
import { fetchUserInteractions, renderDiscovery } from "./discovery";
import { syncCloudProfileForm } from "./profile";
import { upsertPublicPalette } from "./public";
import { buildSyncPayload, parseSyncPayload } from "./serializer";
import { renderCloudUserCard } from "./user-card";

let cloudUnsubscribe: (() => void) | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

const formatSyncTimestamp = (value: string | null) => {
  if (!value) {
    return t("cloud.status.notSynced");
  }
  return t("cloud.status.lastSynced", { time: value });
};

const setCloudStatusMessage = (message: string) => {
  if (cloudStatus) {
    cloudStatus.textContent = message;
  }
};

const updateCloudControls = () => {
  if (!cloudState.isConfigured) {
    const missing = firebaseConfigStatus.missingKeys.join(", ");
    setCloudStatusMessage(t("cloud.status.missingKeys", { missing }));
  } else if (!cloudState.user) {
    setCloudStatusMessage(t("cloud.status.signedOut"));
  } else if (cloudState.isSyncing) {
    setCloudStatusMessage(t("cloud.status.syncing"));
  } else {
    setCloudStatusMessage(formatSyncTimestamp(cloudState.lastSyncedAt));
  }

  if (cloudSignInButton) {
    cloudSignInButton.disabled = !cloudState.isConfigured || !!cloudState.user;
  }
  if (cloudAuthSection) {
    cloudAuthSection.classList.toggle("is-hidden", Boolean(cloudState.user));
  }
  if (cloudSessionActions) {
    cloudSessionActions.classList.toggle("is-hidden", !cloudState.user);
  }
  if (cloudProfileSection) {
    cloudProfileSection.classList.toggle("is-hidden", !cloudState.user);
  }
  const disableEmailAuth = !cloudState.isConfigured || !!cloudState.user;
  if (cloudEmailInput) {
    cloudEmailInput.disabled = disableEmailAuth;
  }
  if (cloudPasswordInput) {
    cloudPasswordInput.disabled = disableEmailAuth;
  }
  if (cloudEmailSignInButton) {
    cloudEmailSignInButton.disabled = disableEmailAuth;
  }
  if (cloudEmailSignUpButton) {
    cloudEmailSignUpButton.disabled = disableEmailAuth;
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
  syncPaletteColorNames(payload.preferences.colorNameFormat);
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
  cloudUnsubscribe = onSnapshot(doc(firebaseClient.db, "users", cloudState.user.uid, "state", "app"), (snapshot) => {
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
  });
};

export const syncToCloud = async () => {
  if (!firebaseClient || !cloudState.user) {
    return;
  }
  cloudState.isSyncing = true;
  updateCloudControls();
  const payload = buildSyncPayload(state.palettes, state.activePaletteId, getPreferencesPayload());
  cloudState.lastRevision = payload.revision;
  try {
    await setDoc(
      doc(firebaseClient.db, "users", cloudState.user.uid, "state", "app"),
      { ...payload, updatedAt: serverTimestamp() },
      { merge: true },
    );
    await Promise.all(state.palettes.filter((palette) => palette.isPublic).map((palette) => upsertPublicPalette(palette)));
    cloudState.lastSyncedAt = new Date().toLocaleTimeString();
  } catch (error) {
    console.error(error);
    showToast(t("toast.cloudSyncFailed"), "error");
  } finally {
    cloudState.isSyncing = false;
    updateCloudControls();
  }
};

export const refreshCloudControls = () => {
  updateCloudControls();
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
  }, 1200);
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
          name: user.displayName ?? t("cloud.profile.name.placeholder"),
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
