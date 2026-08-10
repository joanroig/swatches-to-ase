import type { Palette, PublicPalette } from "../types";
// Eager and Firebase-free: importing it here is what sets `cloudState.isConfigured` before the
// first render, so the publish and sign-in controls are drawn in the right state without waiting
// for the SDK. Do not make this a type-only import — the side effect is the point.
import "./config";

/**
 * The one door into the cloud layer from the rest of the app.
 *
 * Everything behind `./bundle` transitively pulls in the Firebase SDK — roughly 370 kB, 117 kB
 * gzipped, which was the single largest thing the app downloaded and parsed before it could paint,
 * for a feature most visits never touch. Routing every call through a dynamic import keeps that
 * chunk off the critical path: it arrives once the app is interactive, or on the first cloud
 * action, whichever comes first.
 *
 * Everything here is a thin forwarder. Void functions are fire-and-forget so callers stay
 * synchronous; the ones that return data stay `async`. Nothing in this module may import Firebase,
 * directly or transitively — that is the whole point, and `cloudState.isConfigured` is set eagerly
 * by `./config` so the UI can still render the right enabled/disabled states before the chunk
 * lands.
 */

let bundlePromise: Promise<typeof import("./bundle")> | null = null;

/** Start loading the cloud layer. Safe to call repeatedly; the import is cached. */
export const loadCloud = () => {
  if (!bundlePromise) {
    bundlePromise = import("./bundle");
  }
  return bundlePromise;
};

/** Warm the chunk once the app is interactive, so the first cloud click is not also a download. */
export const prefetchCloud = () => {
  void loadCloud().catch(() => {
    // A failed prefetch is retried on the next real call.
  });
};

const run = (task: (bundle: typeof import("./bundle")) => unknown) => {
  void loadCloud()
    .then(task)
    .catch((error) => {
      console.error("[cloud] Unable to load the cloud layer.", error);
    });
};

/* -- lifecycle ------------------------------------------------------------- */

export const setupCloudAuth = () => run((cloud) => cloud.setupCloudAuth());
export const setupCloudProfileControls = () => run((cloud) => cloud.setupCloudProfileControls());
export const setupDiscoveryProfileControls = () => run((cloud) => cloud.setupDiscoveryProfileControls());
export const scheduleCloudSync = () => run((cloud) => cloud.scheduleCloudSync());
export const syncToCloud = (source: "manual" | "auto" | "init" = "auto") => run((cloud) => cloud.syncToCloud(source));
export const refreshCloudControls = () => run((cloud) => cloud.refreshCloudControls());
export const refreshCloudUser = () => run((cloud) => cloud.refreshCloudUser());
export const resetCloudProfileDraft = () => run((cloud) => cloud.resetCloudProfileDraft());
export const syncCloudProfileForm = () => run((cloud) => cloud.syncCloudProfileForm());

/* -- discovery ------------------------------------------------------------- */

export const renderDiscovery = () => run((cloud) => cloud.renderDiscovery());
export const listenToDiscovery = () => run((cloud) => cloud.listenToDiscovery());
export const setDiscoverySort = (value: string) => run((cloud) => cloud.setDiscoverySort(value));
export const setDiscoverySearch = (value: string) => run((cloud) => cloud.setDiscoverySearch(value));
export const fetchUserInteractions = async () => {
  const cloud = await loadCloud();
  return cloud.fetchUserInteractions();
};

/* -- palettes -------------------------------------------------------------- */

export const upsertPublicPalette = async (palette: Palette) => {
  const cloud = await loadCloud();
  return cloud.upsertPublicPalette(palette);
};

export const unpublishPalette = async (palette: Palette, options: { persist?: boolean } = {}) => {
  const cloud = await loadCloud();
  return cloud.unpublishPalette(palette, options);
};

export const savePublicPalette = async (palette: PublicPalette) => {
  const cloud = await loadCloud();
  return cloud.savePublicPalette(palette);
};

export const toggleLikePublicPalette = async (palette: PublicPalette) => {
  const cloud = await loadCloud();
  return cloud.toggleLikePublicPalette(palette);
};
