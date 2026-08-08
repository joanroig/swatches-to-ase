import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import {
  cloudAuthSection,
  cloudChangeEmailButton,
  cloudEmailInput,
  cloudEmailSignInButton,
  cloudEmailSignUpButton,
  cloudManagementSection,
  cloudModal,
  cloudPasswordInput,
  cloudPasswordResetButton,
  cloudProfileSection,
  cloudSessionActions,
  cloudSessionLinks,
  cloudDeleteAccountButton,
  cloudSignInButton,
  cloudSignOutButton,
  cloudStatus,
  cloudSyncStatus,
  cloudSyncButton,
  cloudVerifyEmailButton,
  cloudVerificationEmail,
  cloudVerificationSection,
} from "../dom";
import { t } from "../i18n";
import { renderPaletteList, syncPaletteColorNames } from "../palette/ui";
import { persistPreferences } from "../persistence";
import { applyRemotePreferences, getPreferencesPayload } from "../preferences";
import { cloudState, discoveryState, state } from "../state";
import type { CloudUser, Folder, Palette } from "../types";
import { showToast } from "../ui/notifications";
import { ensureAppCheckToken, firebaseClient, firebaseConfigStatus } from "./context";
import { fetchUserInteractions, renderDiscovery } from "./discovery";
import { getFirebaseErrorCode, logCloudError } from "./errors";
import { fetchFollowing } from "./follow";
import { mergeLibraries, palettesEquivalent, resolveMergedActivePaletteId } from "./merge";
import { syncCloudProfileForm } from "./profile";
import { ensureUserAvatar } from "./profile-store";
import { unpublishPalette, upsertPublicPalette } from "./public";
import { buildSyncPayload, parseSyncPayload } from "./serializer";
import { renderCloudUserCard } from "./user-card";
import { isCloudUserVerified, requireVerifiedCloudUser } from "./verification";

let cloudUnsubscribe: (() => void) | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let manualSyncCooldownTimer: ReturnType<typeof setTimeout> | null = null;
let syncCooldownTimer: ReturnType<typeof setTimeout> | null = null;
let manualSyncCooldownUntil = 0;
const MANUAL_SYNC_COOLDOWN_MS = 3000;
const PUBLIC_UPSERT_COOLDOWN_MS = 2500;
let initialSyncTimer: ReturnType<typeof setTimeout> | null = null;
let initialSyncAttempts = 0;
const INITIAL_SYNC_BASE_DELAY_MS = 1200;
const INITIAL_SYNC_MAX_ATTEMPTS = 2;
let verificationPollTimer: ReturnType<typeof setInterval> | null = null;
const VERIFICATION_POLL_INTERVAL_MS = 6000;

const wasRecentlyUpserted = (paletteId: string) => {
  const lastUpsert = cloudState.recentPublicUpserts.get(paletteId);
  if (!lastUpsert) {
    return false;
  }
  if (Date.now() - lastUpsert > PUBLIC_UPSERT_COOLDOWN_MS) {
    cloudState.recentPublicUpserts.delete(paletteId);
    return false;
  }
  return true;
};

const isManualSyncCoolingDown = () => Date.now() < manualSyncCooldownUntil;
const isPublicSyncCoolingDown = () => Date.now() < cloudState.publicSyncCooldownUntil;
const isSyncCoolingDown = () => isManualSyncCoolingDown() || isPublicSyncCoolingDown();

const scheduleSyncCooldownRefresh = () => {
  if (syncCooldownTimer) {
    clearTimeout(syncCooldownTimer);
  }
  const nextCooldown = Math.min(
    manualSyncCooldownUntil || Number.POSITIVE_INFINITY,
    cloudState.publicSyncCooldownUntil || Number.POSITIVE_INFINITY,
  );
  if (!Number.isFinite(nextCooldown)) {
    return;
  }
  const delay = Math.max(0, nextCooldown - Date.now());
  syncCooldownTimer = setTimeout(() => {
    syncCooldownTimer = null;
    updateCloudControls();
  }, delay);
};

const isCloudModalOpen = () => cloudModal?.getAttribute("aria-hidden") !== "true";

const stopVerificationPolling = () => {
  if (!verificationPollTimer) {
    return;
  }
  clearInterval(verificationPollTimer);
  verificationPollTimer = null;
};

const startVerificationPolling = () => {
  if (verificationPollTimer || !firebaseClient) {
    return;
  }
  verificationPollTimer = setInterval(async () => {
    if (!isCloudModalOpen() || !cloudState.user || cloudState.user.emailVerified) {
      stopVerificationPolling();
      return;
    }
    await refreshCloudUser();
  }, VERIFICATION_POLL_INTERVAL_MS);
};

const logSyncError = (context: string, error: unknown, meta: Record<string, unknown> = {}) => {
  logCloudError(context, error, meta);
  if (getFirebaseErrorCode(error) === "permission-denied") {
    console.warn(
      "[cloud] permission-denied hints: check Firestore rules for /users/{uid}/state/app and /publicPalettes, App Check enforcement, a verified email, palette limits (sync palettes <= 200, public palette colors <= 16, name <= 80), and legacy fields when using merge writes.",
    );
  }
};

const clearInitialSyncRetry = () => {
  if (initialSyncTimer) {
    clearTimeout(initialSyncTimer);
    initialSyncTimer = null;
  }
  initialSyncAttempts = 0;
};

const queueInitialSyncRetry = () => {
  if (!firebaseClient || !cloudState.user) {
    return;
  }
  if (initialSyncTimer) {
    return;
  }
  const attempt = async () => {
    initialSyncTimer = null;
    if (!firebaseClient || !cloudState.user) {
      return;
    }
    const synced = await syncToCloud("init");
    if (synced) {
      clearInitialSyncRetry();
      return;
    }
    initialSyncAttempts += 1;
    if (initialSyncAttempts >= INITIAL_SYNC_MAX_ATTEMPTS) {
      return;
    }
    const delay = INITIAL_SYNC_BASE_DELAY_MS * Math.pow(2, initialSyncAttempts);
    initialSyncTimer = setTimeout(attempt, delay);
  };
  initialSyncTimer = setTimeout(attempt, INITIAL_SYNC_BASE_DELAY_MS);
};

const getPublicPaletteIssues = (palette: Palette) => {
  const issues: string[] = [];
  if (palette.colors.length > 16) {
    issues.push(`colors:${palette.colors.length} > 16`);
  }
  if (palette.name.length > 80) {
    issues.push(`nameLength:${palette.name.length} > 80`);
  }
  return issues;
};

const formatSyncTimestamp = (value: string | null) => {
  if (!value) {
    return t("cloud.status.notSynced");
  }
  return t("cloud.status.lastSynced", { time: value });
};

const setCloudStatusMessage = (message: string | null) => {
  if (!cloudStatus) {
    return;
  }
  cloudStatus.textContent = message ?? "";
  cloudStatus.classList.toggle("is-hidden", !message);
};

const setCloudSyncStatusMessage = (message: string | null) => {
  if (!cloudSyncStatus) {
    return;
  }
  cloudSyncStatus.textContent = message ?? "";
  cloudSyncStatus.classList.toggle("is-hidden", !message);
};

const updateCloudControls = () => {
  let headerStatus: string | null = null;
  let syncStatus: string | null = null;

  if (!cloudState.isConfigured) {
    const missing = firebaseConfigStatus.missingKeys.join(", ");
    headerStatus = t("cloud.status.missingKeys", { missing });
  } else if (!cloudState.user) {
    headerStatus = t("cloud.status.signedOut");
  } else if (!isCloudUserVerified()) {
    headerStatus = t("cloud.status.verifyEmail");
  } else if (cloudState.isSyncing) {
    syncStatus = t("cloud.status.syncing");
  } else {
    syncStatus = formatSyncTimestamp(cloudState.lastSyncedAt);
  }

  setCloudStatusMessage(headerStatus);
  setCloudSyncStatusMessage(syncStatus);

  const hasUser = Boolean(cloudState.user);
  const isVerified = isCloudUserVerified();
  const shouldShowVerification = hasUser && !isVerified;
  const shouldPollVerification = shouldShowVerification && isCloudModalOpen();

  if (cloudSignInButton) {
    cloudSignInButton.disabled = !cloudState.isConfigured || hasUser;
  }
  if (cloudAuthSection) {
    cloudAuthSection.classList.toggle("is-hidden", hasUser);
  }
  if (cloudVerificationSection) {
    cloudVerificationSection.classList.toggle("is-hidden", !shouldShowVerification);
  }
  if (cloudManagementSection) {
    cloudManagementSection.classList.toggle("is-hidden", !hasUser);
  }
  if (cloudSessionActions) {
    cloudSessionActions.classList.toggle("is-hidden", !hasUser);
  }
  if (cloudSessionLinks) {
    cloudSessionLinks.classList.toggle("is-hidden", !hasUser);
  }
  if (cloudProfileSection) {
    cloudProfileSection.classList.toggle("is-hidden", !hasUser || !isVerified);
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
  if (cloudPasswordResetButton) {
    cloudPasswordResetButton.disabled = disableEmailAuth;
  }
  if (cloudSignOutButton) {
    cloudSignOutButton.disabled = !cloudState.user;
  }
  if (cloudDeleteAccountButton) {
    cloudDeleteAccountButton.disabled = !cloudState.user;
  }
  if (cloudSyncButton) {
    cloudSyncButton.disabled = !cloudState.user || !isCloudUserVerified() || cloudState.isSyncing || isSyncCoolingDown();
  }
  if (cloudVerifyEmailButton) {
    cloudVerifyEmailButton.disabled = !shouldShowVerification;
  }
  if (cloudChangeEmailButton) {
    cloudChangeEmailButton.disabled = !shouldShowVerification;
  }
  if (cloudVerificationEmail) {
    const email = cloudState.user?.email?.trim();
    cloudVerificationEmail.textContent = email || t("cloud.verification.emailFallback");
  }

  renderCloudUserCard();
  if (shouldPollVerification) {
    startVerificationPolling();
  } else {
    stopVerificationPolling();
  }
  scheduleSyncCooldownRefresh();
};

const startManualSyncCooldown = () => {
  manualSyncCooldownUntil = Date.now() + MANUAL_SYNC_COOLDOWN_MS;
  if (manualSyncCooldownTimer) {
    clearTimeout(manualSyncCooldownTimer);
  }
  manualSyncCooldownTimer = setTimeout(() => {
    manualSyncCooldownTimer = null;
    updateCloudControls();
  }, MANUAL_SYNC_COOLDOWN_MS);
  scheduleSyncCooldownRefresh();
};

const resolveCloudUser = async (user: User): Promise<CloudUser> => {
  const avatar = await ensureUserAvatar(user.uid);
  return {
    uid: user.uid,
    name: user.displayName ?? t("cloud.profile.name.placeholder"),
    email: user.email,
    emailVerified: user.emailVerified,
    avatar,
  };
};

export const refreshCloudUser = async () => {
  if (!firebaseClient) {
    return;
  }
  const currentUser = firebaseClient.auth.currentUser;
  if (!currentUser) {
    return;
  }
  try {
    await currentUser.reload();
  } catch (error) {
    console.warn("[cloud] Failed to refresh user session.", error);
  }
  cloudState.user = await resolveCloudUser(currentUser);
  updateCloudControls();
  syncCloudProfileForm();
  renderPaletteList();
};

/** `folders` defaults to the remote list; the merge path passes the reconciled one instead. */
const applyRemoteStateWithPalettes = (
  payload: ReturnType<typeof parseSyncPayload>,
  palettes: Palette[],
  activePaletteId: string | null,
  folders?: Folder[],
) => {
  if (!payload) {
    return;
  }
  cloudState.applyingRemote = true;
  cloudState.lastRevision = payload.revision;
  state.palettes = palettes;
  state.folders = folders ?? payload.folders;
  state.activePaletteId = activePaletteId;
  applyRemotePreferences(payload.preferences);
  persistPreferences();
  syncPaletteColorNames(payload.preferences.colorNameFormat);
  cloudState.applyingRemote = false;
};

const applyRemoteState = (payload: ReturnType<typeof parseSyncPayload>) => {
  if (!payload) {
    return;
  }
  applyRemoteStateWithPalettes(payload, payload.palettes, payload.activePaletteId ?? null);
};

const listenToCloudState = () => {
  if (!firebaseClient || !cloudState.user) {
    return;
  }
  if (cloudUnsubscribe) {
    cloudUnsubscribe();
  }
  clearInitialSyncRetry();
  cloudUnsubscribe = onSnapshot(doc(firebaseClient.db, "users", cloudState.user.uid, "state", "app"), async (snapshot) => {
    if (!snapshot.exists()) {
      queueInitialSyncRetry();
      return;
    }
    clearInitialSyncRetry();
    const payload = parseSyncPayload(snapshot.data());
    if (!payload || payload.revision === cloudState.lastRevision) {
      return;
    }
    const hasLocalPalettes = state.palettes.length > 0;
    if (!cloudState.hasResolvedInitialSync && hasLocalPalettes) {
      cloudState.hasResolvedInitialSync = true;
      if (palettesEquivalent(state.palettes, payload.palettes)) {
        applyRemoteState(payload);
        cloudState.lastSyncedAt = new Date().toLocaleTimeString();
        updateCloudControls();
        return;
      }
      const shouldMerge = window.confirm(
        t("cloud.sync.mergeConfirm", { localCount: state.palettes.length, cloudCount: payload.palettes.length }),
      );
      if (shouldMerge) {
        const merged = mergeLibraries(
          { palettes: state.palettes, folders: state.folders },
          { palettes: payload.palettes, folders: payload.folders },
        );
        const activePaletteId = resolveMergedActivePaletteId(payload.activePaletteId ?? null, state.activePaletteId, merged.palettes);
        applyRemoteStateWithPalettes(payload, merged.palettes, activePaletteId, merged.folders);
        cloudState.lastSyncedAt = new Date().toLocaleTimeString();
        updateCloudControls();
        void syncToCloud();
        return;
      }
      const remoteIds = new Set(payload.palettes.map((palette) => palette.id));
      const removedPublic = state.palettes.filter((palette) => palette.isPublic && !remoteIds.has(palette.id));
      if (removedPublic.length > 0) {
        const results = await Promise.allSettled(removedPublic.map((palette) => unpublishPalette(palette, { persist: false })));
        if (results.some((result) => result.status === "rejected")) {
          showToast(t("toast.paletteUnpublishFailed"), "error");
        }
      }
      applyRemoteState(payload);
      cloudState.lastSyncedAt = new Date().toLocaleTimeString();
      updateCloudControls();
      return;
    }
    cloudState.hasResolvedInitialSync = true;
    applyRemoteState(payload);
    cloudState.lastSyncedAt = new Date().toLocaleTimeString();
    updateCloudControls();
  });
};

export const syncToCloud = async (source: "manual" | "auto" | "init" = "auto"): Promise<boolean> => {
  console.log("[cloud] Starting sync to cloud...");
  if (!firebaseClient || !cloudState.user) {
    return false;
  }
  if (!requireVerifiedCloudUser({ showToast: source === "manual" })) {
    updateCloudControls();
    return false;
  }
  if (source === "manual") {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    if (isSyncCoolingDown()) {
      scheduleSyncCooldownRefresh();
      return false;
    }
    startManualSyncCooldown();
    updateCloudControls();
  }
  if (cloudState.isSyncing) {
    return false;
  }
  cloudState.isSyncing = true;
  updateCloudControls();
  const appCheckReady = await ensureAppCheckToken(firebaseClient, source === "init");
  if (!appCheckReady) {
    if (source !== "init") {
      showToast(t("toast.cloudSyncFailed"), "error");
    }
    cloudState.isSyncing = false;
    updateCloudControls();
    return false;
  }
  const payload = buildSyncPayload(state.palettes, state.folders, state.activePaletteId, getPreferencesPayload());
  cloudState.lastRevision = payload.revision;
  const publicPalettes = state.palettes.filter((palette) => palette.isPublic);
  const publicPalettesToSync = publicPalettes.filter((palette) => !wasRecentlyUpserted(palette.id));
  if (payload.palettes.length > 200) {
    console.warn("[cloud] Sync payload exceeds palette limit (200).", { paletteCount: payload.palettes.length });
  }
  const paletteIssues = publicPalettes
    .map((palette) => ({
      id: palette.id,
      publicId: palette.publicId ?? null,
      issues: getPublicPaletteIssues(palette),
    }))
    .filter((entry) => entry.issues.length > 0);
  if (paletteIssues.length > 0) {
    console.warn("[cloud] Public palettes may violate publish rules.", paletteIssues);
  }
  let stage: "state" | "public" = "state";
  let stateWriteOk = false;
  try {
    await setDoc(doc(firebaseClient.db, "users", cloudState.user.uid, "state", "app"), { ...payload, updatedAt: serverTimestamp() });
    stateWriteOk = true;
    stage = "public";
    const results = await Promise.allSettled(publicPalettesToSync.map((palette) => upsertPublicPalette(palette)));
    const failures = results
      .map((result, index) =>
        result.status === "rejected" ? { palette: publicPalettesToSync[index], error: result.reason as unknown } : null,
      )
      .filter((entry): entry is { palette: Palette; error: unknown } => !!entry);
    if (failures.length > 0) {
      failures.forEach(({ palette, error }) => {
        logSyncError("Public palette sync", error, {
          paletteId: palette.id,
          publicId: palette.publicId ?? null,
          nameLength: palette.name.length,
          colorCount: palette.colors.length,
          issues: getPublicPaletteIssues(palette),
        });
      });
      throw new Error(`Public palette sync failed (${failures.length})`);
    }
    cloudState.lastSyncedAt = new Date().toLocaleTimeString();
  } catch (error) {
    logSyncError(`Cloud sync (${stage})`, error, {
      paletteCount: payload.palettes.length,
      publicPaletteCount: publicPalettes.length,
    });
    if (source !== "init") {
      showToast(t("toast.cloudSyncFailed"), "error");
    }
  } finally {
    cloudState.isSyncing = false;
    updateCloudControls();
  }
  return stateWriteOk;
};

export const refreshCloudControls = () => {
  updateCloudControls();
};

export const scheduleCloudSync = () => {
  if (!firebaseClient || !cloudState.user) {
    return;
  }
  if (!isCloudUserVerified()) {
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
    const authUid = user?.uid ?? null;
    const resolvedUser = user ? await resolveCloudUser(user) : null;
    if (authUid && firebaseClient.auth.currentUser?.uid !== authUid) {
      return;
    }
    const previousUid = cloudState.user?.uid ?? null;
    cloudState.user = resolvedUser;
    cloudState.hasResolvedInitialSync = false;
    cloudState.lastRevision = null;
    cloudState.lastSyncedAt = null;
    updateCloudControls();
    syncCloudProfileForm();
    // Only when the signed-in identity actually changed. This callback also fires once on start-up
    // with the user it already had (usually none), and rebuilding the whole library for a no-op
    // change threw away scroll position and any interaction in progress.
    if (previousUid !== authUid) {
      renderPaletteList();
    }
    clearInitialSyncRetry();
    if (cloudUnsubscribe) {
      cloudUnsubscribe();
      cloudUnsubscribe = null;
    }
    if (!cloudState.user) {
      discoveryState.likedIds.clear();
      discoveryState.savedIds.clear();
      discoveryState.followingIds.clear();
      renderDiscovery();
      return;
    }
    await Promise.allSettled([fetchUserInteractions(), fetchFollowing()]);
    listenToCloudState();
  });
};
