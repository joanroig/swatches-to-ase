import { cloudState } from "../state";

/**
 * Firebase configuration, with no dependency on the Firebase SDK.
 *
 * Kept separate from `client.ts` so the rest of the app can ask "is the cloud configured?" — which
 * decides whether buttons are enabled and whether Discover is reachable — without pulling the
 * 370 kB SDK into the first-paint bundle.
 */

export type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
};

export const firebaseConfig: FirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const appCheckDisabled = import.meta.env.VITE_DISABLE_APP_CHECK === "true" || import.meta.env.VITE_DISABLE_APP_CHECK === "1";

const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"] as const;

export const getFirebaseConfigStatus = () => {
  const missing = requiredKeys.filter((key) => !firebaseConfig[key]);
  return {
    isConfigured: missing.length === 0,
    missingKeys: missing,
  };
};

export const firebaseConfigStatus = getFirebaseConfigStatus();

// Set before anything renders: the publish and sync controls read it while drawing.
cloudState.isConfigured = firebaseConfigStatus.isConfigured;
