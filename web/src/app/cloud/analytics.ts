import type { Analytics } from "firebase/analytics";

/**
 * Firebase Analytics, loaded lazily and only when it can actually run.
 *
 * The SDK is a sizeable chunk and is irrelevant to the core app, so it is imported dynamically the
 * first time an event is logged rather than at start-up. Every call is fire-and-forget: analytics
 * must never be able to break a user action.
 */

const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? "";
const analyticsDisabled = import.meta.env.VITE_DISABLE_ANALYTICS === "true" || import.meta.env.VITE_DISABLE_ANALYTICS === "1";

export type AnalyticsEvent =
  | "palette_created"
  | "palette_imported"
  | "palette_published"
  | "palette_unpublished"
  | "palette_saved_from_discover"
  | "palette_liked"
  | "palette_exported"
  | "palette_shared"
  | "folder_created"
  | "colors_extracted_from_image"
  | "discover_opened"
  | "playground_opened"
  | "playground_shuffled"
  | "playground_scene_changed"
  | "playground_palette_saved"
  | "sign_in"
  | "sign_up";

let analyticsPromise: Promise<Analytics | null> | null = null;

export const isAnalyticsConfigured = () => Boolean(measurementId) && !analyticsDisabled;

/**
 * Honour Do Not Track and Global Privacy Control. Neither is legally binding everywhere, but
 * ignoring an explicit opt-out signal for a tool like this is not worth the data.
 */
const hasOptedOut = () => {
  if (typeof navigator === "undefined") {
    return true;
  }
  const dnt = navigator.doNotTrack ?? (window as unknown as { doNotTrack?: string }).doNotTrack;
  if (dnt === "1" || dnt === "yes") {
    return true;
  }
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
};

const loadAnalytics = async (): Promise<Analytics | null> => {
  if (!isAnalyticsConfigured() || hasOptedOut()) {
    return null;
  }
  try {
    const [{ getAnalytics, isSupported }, { getFirebaseApp }] = await Promise.all([import("firebase/analytics"), import("./client")]);
    const app = getFirebaseApp();
    if (!app || !(await isSupported())) {
      return null;
    }
    return getAnalytics(app);
  } catch (error) {
    console.warn("[analytics] Unavailable.", error);
    return null;
  }
};

const getAnalyticsInstance = () => {
  if (!analyticsPromise) {
    analyticsPromise = loadAnalytics();
  }
  return analyticsPromise;
};

/** Record a product event. Never throws and never blocks the caller. */
export const trackEvent = (event: AnalyticsEvent, params: Record<string, string | number | boolean> = {}) => {
  if (!isAnalyticsConfigured()) {
    return;
  }
  void getAnalyticsInstance()
    .then(async (analytics) => {
      if (!analytics) {
        return;
      }
      const { logEvent } = await import("firebase/analytics");
      // Widen to the custom-event overload: some of these names collide with GA's recommended
      // events, whose typed overloads demand a specific parameter shape.
      logEvent(analytics, event as string, params);
    })
    .catch(() => {
      // Analytics failures are never worth surfacing.
    });
};
