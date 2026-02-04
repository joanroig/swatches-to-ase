import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import {
  cloudAuthSection,
  cloudEmailInput,
  cloudEmailSignInButton,
  cloudEmailSignUpButton,
  cloudPasswordInput,
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
import type { CloudUser, Palette } from "../types";
import { showToast } from "../ui/notifications";
import { createId } from "../utils/id";
import { ensureAppCheckToken, firebaseClient, firebaseConfigStatus } from "./context";
import { fetchUserInteractions, renderDiscovery } from "./discovery";
import { syncCloudProfileForm } from "./profile";
import { ensureUserAvatar } from "./profile-store";
import { unpublishPalette, upsertPublicPalette } from "./public";
import { buildSyncPayload, parseSyncPayload } from "./serializer";
import { renderCloudUserCard } from "./user-card";

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

const getErrorInfo = (error: unknown) => {
  if (error && typeof error === "object") {
    const candidate = error as { code?: string; message?: string; name?: string };
    return { code: candidate.code, message: candidate.message, name: candidate.name };
  }
  return { code: undefined, message: String(error), name: undefined };
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

const logCloudError = (context: string, error: unknown, meta: Record<string, unknown> = {}) => {
  const info = getErrorInfo(error);
  console.error(`[cloud] ${context} failed`, { ...info, ...meta }, error);
  if (info.code === "permission-denied") {
    console.warn(
      "[cloud] permission-denied hints: check Firestore rules for /users/{uid}/state/app and /publicPalettes, App Check enforcement, palette limits (sync palettes <= 200, public palette colors <= 16, name <= 80), and legacy fields when using merge writes.",
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
    cloudSyncButton.disabled = !cloudState.user || cloudState.isSyncing || isSyncCoolingDown();
  }

  renderCloudUserCard();
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
    avatar,
  };
};

const clonePalette = (palette: Palette): Palette => ({
  id: palette.id,
  name: palette.name,
  colors: palette.colors.map((color) => ({
    id: color.id,
    name: color.name,
    rgb: [...color.rgb] as [number, number, number],
  })),
  lastModified: typeof palette.lastModified === "number" ? palette.lastModified : 0,
  isPublic: palette.isPublic ?? false,
  publicId: palette.publicId ?? null,
});

const buildPaletteFingerprint = (palette: Palette) => {
  const colors = palette.colors.map((color) => color.rgb.join(",")).join("|");
  return `${palette.name}::${colors}`;
};

const createBackupPalette = (palette: Palette): Palette => {
  const backup = clonePalette(palette);
  backup.id = createId();
  backup.name = `(BACKUP) ${backup.name}`;
  backup.isPublic = false;
  backup.publicId = null;
  return backup;
};

const palettesEquivalent = (left: Palette[], right: Palette[]) => {
  if (left.length !== right.length) {
    return false;
  }
  const rightById = new Map(right.map((palette) => [palette.id, palette]));
  return left.every((palette) => {
    const other = rightById.get(palette.id);
    if (!other) {
      return false;
    }
    const leftModified = typeof palette.lastModified === "number" ? palette.lastModified : 0;
    const rightModified = typeof other.lastModified === "number" ? other.lastModified : 0;
    return leftModified === rightModified;
  });
};

const mergePalettes = (localPalettes: Palette[], remotePalettes: Palette[]) => {
  const merged = [...remotePalettes];
  const remoteById = new Map(remotePalettes.map((palette) => [palette.id, palette]));
  const seenFingerprints = new Set(remotePalettes.map(buildPaletteFingerprint));

  localPalettes.forEach((palette) => {
    const fingerprint = buildPaletteFingerprint(palette);
    const remoteMatch = remoteById.get(palette.id);
    if (remoteMatch) {
      const localModified = typeof palette.lastModified === "number" ? palette.lastModified : 0;
      const remoteModified = typeof remoteMatch.lastModified === "number" ? remoteMatch.lastModified : 0;
      if (localModified !== remoteModified) {
        const backup = createBackupPalette(palette);
        merged.push(backup);
        seenFingerprints.add(buildPaletteFingerprint(backup));
      }
      return;
    }
    if (seenFingerprints.has(fingerprint)) {
      return;
    }
    merged.push(palette);
    seenFingerprints.add(fingerprint);
  });

  return merged;
};

const resolveMergedActivePaletteId = (
  remoteActiveId: string | null,
  localActiveId: string | null,
  palettes: Palette[],
) => {
  if (remoteActiveId && palettes.some((palette) => palette.id === remoteActiveId)) {
    return remoteActiveId;
  }
  if (localActiveId && palettes.some((palette) => palette.id === localActiveId)) {
    return localActiveId;
  }
  return palettes[0]?.id ?? null;
};

const applyRemoteStateWithPalettes = (
  payload: ReturnType<typeof parseSyncPayload>,
  palettes: Palette[],
  activePaletteId: string | null,
) => {
  if (!payload) {
    return;
  }
  cloudState.applyingRemote = true;
  cloudState.lastRevision = payload.revision;
  state.palettes = palettes;
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
        const merged = mergePalettes(state.palettes, payload.palettes);
        const activePaletteId = resolveMergedActivePaletteId(payload.activePaletteId ?? null, state.activePaletteId, merged);
        applyRemoteStateWithPalettes(payload, merged, activePaletteId);
        cloudState.lastSyncedAt = new Date().toLocaleTimeString();
        updateCloudControls();
        void syncToCloud();
        return;
      }
      const remoteIds = new Set(payload.palettes.map((palette) => palette.id));
      const removedPublic = state.palettes.filter((palette) => palette.isPublic && !remoteIds.has(palette.id));
      if (removedPublic.length > 0) {
        const results = await Promise.allSettled(
          removedPublic.map((palette) => unpublishPalette(palette, { persist: false })),
        );
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
  const payload = buildSyncPayload(state.palettes, state.activePaletteId, getPreferencesPayload());
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
        logCloudError("Public palette sync", error, {
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
    logCloudError(`Cloud sync (${stage})`, error, {
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
    cloudState.user = resolvedUser;
    cloudState.hasResolvedInitialSync = false;
    cloudState.lastRevision = null;
    cloudState.lastSyncedAt = null;
    updateCloudControls();
    syncCloudProfileForm();
    renderPaletteList();
    clearInitialSyncRetry();
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
    try {
      await fetchUserInteractions();
    } catch (error) {
      console.warn("[cloud] Failed to load user interactions.", error);
    }
    listenToCloudState();
  });
};
