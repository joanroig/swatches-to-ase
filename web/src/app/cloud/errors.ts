import { t } from "../i18n";
import { showToast } from "../ui/notifications";

/** Firebase throws plain objects with a `code`; narrow it without depending on the SDK's types. */
export const getFirebaseErrorCode = (error: unknown): string | null => {
  if (!error || typeof error !== "object") {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
};

/**
 * Auth codes worth naming. Everything else falls back to the caller's generic message, because a
 * wrong guess is worse than "something went wrong".
 */
const AUTH_MESSAGE_KEYS: Record<string, string> = {
  "auth/invalid-email": "toast.authInvalidEmail",
  "auth/missing-password": "toast.authWrongPassword",
  "auth/invalid-credential": "toast.authWrongPassword",
  "auth/invalid-login-credentials": "toast.authWrongPassword",
  "auth/wrong-password": "toast.authWrongPassword",
  "auth/user-not-found": "toast.authWrongPassword",
  "auth/user-disabled": "toast.authUserDisabled",
  "auth/email-already-in-use": "toast.authEmailInUse",
  "auth/weak-password": "toast.authWeakPassword",
  "auth/too-many-requests": "toast.authTooManyRequests",
  "auth/network-request-failed": "toast.networkError",
  "auth/popup-closed-by-user": "toast.authPopupClosed",
  "auth/cancelled-popup-request": "toast.authPopupClosed",
  "auth/popup-blocked": "toast.authPopupBlocked",
  "auth/operation-not-allowed": "toast.authOperationNotAllowed",
};

const FIRESTORE_MESSAGE_KEYS: Record<string, string> = {
  "permission-denied": "toast.cloudPermissionDenied",
  unauthenticated: "toast.cloudPermissionDenied",
  unavailable: "toast.networkError",
  "deadline-exceeded": "toast.networkError",
  "not-found": "toast.cloudNotFound",
  "resource-exhausted": "toast.authTooManyRequests",
};

const resolveMessage = (error: unknown, table: Record<string, string>, fallbackKey: string) => {
  const code = getFirebaseErrorCode(error);
  const key = code ? table[code] : undefined;
  return t(key ?? fallbackKey);
};

/** Report an auth failure with a specific message when the code is one we recognise. */
export const reportAuthError = (context: string, error: unknown, fallbackKey: string) => {
  console.error(`[cloud] ${context} failed`, getFirebaseErrorCode(error), error);
  showToast(resolveMessage(error, AUTH_MESSAGE_KEYS, fallbackKey), "error");
};

/** Report a Firestore failure with a specific message when the code is one we recognise. */
export const reportCloudError = (context: string, error: unknown, fallbackKey: string) => {
  console.error(`[cloud] ${context} failed`, getFirebaseErrorCode(error), error);
  showToast(resolveMessage(error, FIRESTORE_MESSAGE_KEYS, fallbackKey), "error");
};

/** Silent variant for background work where a toast would be noise. */
export const logCloudError = (context: string, error: unknown, meta: Record<string, unknown> = {}) => {
  console.error(`[cloud] ${context} failed`, { code: getFirebaseErrorCode(error), ...meta }, error);
};
