import { initializeApp, type FirebaseApp } from "firebase/app";
import { getToken, initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

import { appCheckDisabled, firebaseConfig, getFirebaseConfigStatus } from "./config";

export type FirebaseClient = {
  auth: ReturnType<typeof getAuth>;
  db: ReturnType<typeof getFirestore>;
  provider: GoogleAuthProvider;
  appCheck?: AppCheck | null;
};

export { getFirebaseConfigStatus };

let cachedClient: FirebaseClient | null = null;
let cachedApp: FirebaseApp | null = null;

/** The initialised app, for lazily loaded add-ons such as Analytics. */
export const getFirebaseApp = () => cachedApp;

export const getFirebaseClient = (): FirebaseClient | null => {
  const { isConfigured } = getFirebaseConfigStatus();
  if (!isConfigured) {
    return null;
  }
  if (cachedClient) {
    return cachedClient;
  }
  const app = initializeApp(firebaseConfig);
  cachedApp = app;
  let appCheck: AppCheck | null = null;
  const appCheckKey = import.meta.env.VITE_FIREBASE_APP_CHECK_KEY ?? "";
  if (appCheckKey && typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isWebOrigin = window.location.protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
    if (isWebOrigin && !appCheckDisabled) {
      try {
        const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
        if (debugToken) {
          const value = debugToken === "true" || debugToken === "1" ? true : debugToken;
          (window as Window & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = value;
        }
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(appCheckKey),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (error) {
        console.warn("App Check initialization failed", error);
      }
    }
  }
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  cachedClient = { auth, db, provider, appCheck };
  return cachedClient;
};

export const ensureAppCheckToken = async (client: FirebaseClient | null, forceRefresh = false) => {
  if (!client?.appCheck) {
    return true;
  }
  try {
    await getToken(client.appCheck, forceRefresh);
    return true;
  } catch (error) {
    console.warn("[cloud] App Check token unavailable.", error);
    return false;
  }
};
