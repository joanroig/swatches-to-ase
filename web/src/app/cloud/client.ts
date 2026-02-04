import { initializeApp } from "firebase/app";
import { getToken, initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export type FirebaseClient = {
  auth: ReturnType<typeof getAuth>;
  db: ReturnType<typeof getFirestore>;
  provider: GoogleAuthProvider;
  appCheck?: AppCheck | null;
};

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
};

const firebaseConfig: FirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};
const appCheckDisabled =
  import.meta.env.VITE_DISABLE_APP_CHECK === "true" || import.meta.env.VITE_DISABLE_APP_CHECK === "1";

const requiredKeys = ["apiKey", "authDomain", "projectId", "appId"] as const;

export const getFirebaseConfigStatus = () => {
  const missing = requiredKeys.filter((key) => !firebaseConfig[key]);
  return {
    isConfigured: missing.length === 0,
    missingKeys: missing,
  };
};

let cachedClient: FirebaseClient | null = null;

export const getFirebaseClient = (): FirebaseClient | null => {
  const { isConfigured } = getFirebaseConfigStatus();
  if (!isConfigured) {
    return null;
  }
  if (cachedClient) {
    return cachedClient;
  }
  const app = initializeApp(firebaseConfig);
  let appCheck: AppCheck | null = null;
  const appCheckKey = import.meta.env.VITE_FIREBASE_APP_CHECK_KEY ?? "";
  if (appCheckKey && typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isWebOrigin =
      window.location.protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
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
