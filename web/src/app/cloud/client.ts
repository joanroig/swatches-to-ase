import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export type FirebaseClient = {
  auth: ReturnType<typeof getAuth>;
  db: ReturnType<typeof getFirestore>;
  provider: GoogleAuthProvider;
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
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  cachedClient = { auth, db, provider };
  return cachedClient;
};
