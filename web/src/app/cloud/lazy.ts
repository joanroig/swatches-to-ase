import { discoveryState } from "../state";
import type { DiscoverySort, Palette, PublicPalette } from "../types";
// Eager and Firebase-free: importing it here is what sets `cloudState.isConfigured` before the
// first render, so the publish and sign-in controls are drawn in the right state without waiting
// for the SDK. Do not make this a type-only import — the side effect is the point.
import "./config";
import { isPaletteColorFamily, isPaletteStyle } from "./palette-traits";

/**
 * The one door into the cloud layer from the rest of the app.
 *
 * Everything behind `./bundle` transitively pulls in the Firebase SDK — roughly 370 kB, 117 kB
 * gzipped, which was the single largest thing the app downloaded and parsed before it could paint,
 * for a feature most visits never touch. Routing every call through a dynamic import keeps that
 * chunk off the critical path: it arrives for a remembered signed-in session or the first cloud
 * action, whichever comes first.
 *
 * Everything here is a thin forwarder. Void functions are fire-and-forget so callers stay
 * synchronous; the ones that return data stay `async`. Nothing in this module may import Firebase,
 * directly or transitively — that is the whole point, and `cloudState.isConfigured` is set eagerly
 * by `./config` so the UI can still render the right enabled/disabled states before the chunk
 * lands.
 */

let bundlePromise: Promise<typeof import("./bundle")> | null = null;
let cloudSetupComplete = false;

const loadBundle = () => {
  if (!bundlePromise) {
    bundlePromise = import("./bundle");
  }
  return bundlePromise;
};

/** Start and initialise the cloud layer. Safe to call repeatedly; both steps are cached. */
export const loadCloud = async () => {
  const bundle = await loadBundle();
  if (!cloudSetupComplete) {
    cloudSetupComplete = true;
    bundle.setupCloudAuth();
    bundle.setupCloudProfileControls();
    bundle.setupDiscoveryProfileControls();
  }
  return bundle;
};

/** Warm cloud support for a remembered session or an explicit cloud action. */
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

/** Refresh translated cloud UI only when another action has already loaded the SDK. */
export const refreshLoadedCloudUi = () => {
  if (!bundlePromise) {
    return;
  }
  run((cloud) => {
    cloud.renderDiscovery();
    cloud.refreshCloudControls();
    cloud.syncCloudProfileForm();
  });
};

/* -- lifecycle ------------------------------------------------------------- */

export const scheduleCloudSync = () => {
  if (bundlePromise) {
    run((cloud) => cloud.scheduleCloudSync());
  }
};
export const syncToCloud = (source: "manual" | "auto" | "init" = "auto") => run((cloud) => cloud.syncToCloud(source));
export const refreshCloudControls = () => run((cloud) => cloud.refreshCloudControls());
export const refreshCloudUser = () => run((cloud) => cloud.refreshCloudUser());
export const resetCloudProfileDraft = () => run((cloud) => cloud.resetCloudProfileDraft());
export const syncCloudProfileForm = () => run((cloud) => cloud.syncCloudProfileForm());

/* -- discovery ------------------------------------------------------------- */

export const renderDiscovery = () => run((cloud) => cloud.renderDiscovery());
export const listenToDiscovery = () => run((cloud) => cloud.listenToDiscovery());
const DISCOVERY_SORT_OPTIONS: DiscoverySort[] = ["recent", "likes-desc", "likes-asc", "saves-desc", "saves-asc"];

export const setDiscoverySort = (value: string) => {
  discoveryState.sort = (DISCOVERY_SORT_OPTIONS as string[]).includes(value) ? (value as DiscoverySort) : "recent";
  run((cloud) => cloud.renderDiscovery());
};

export const setDiscoverySearch = (value: string) => {
  discoveryState.search = value;
  run((cloud) => cloud.renderDiscovery());
};

export const setDiscoveryStyle = (value: string | null) => {
  discoveryState.style = value && isPaletteStyle(value) ? value : null;
  run((cloud) => cloud.renderDiscovery());
};

export const setDiscoveryColor = (value: string | null) => {
  discoveryState.color = value && isPaletteColorFamily(value) ? value : null;
  run((cloud) => cloud.renderDiscovery());
};

export const clearDiscoveryFilters = () => {
  discoveryState.style = null;
  discoveryState.color = null;
  run((cloud) => cloud.renderDiscovery());
};
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
