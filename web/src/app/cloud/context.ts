import { cloudState } from "../state";
import { ensureAppCheckToken, getFirebaseClient, getFirebaseConfigStatus } from "./client";

export const firebaseClient = getFirebaseClient();
export const firebaseConfigStatus = getFirebaseConfigStatus();
export { ensureAppCheckToken };

cloudState.isConfigured = firebaseConfigStatus.isConfigured;
