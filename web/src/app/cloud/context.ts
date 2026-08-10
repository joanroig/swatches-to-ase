import { firebaseConfigStatus } from "./config";
import { ensureAppCheckToken, getFirebaseClient } from "./client";

export const firebaseClient = getFirebaseClient();
export { ensureAppCheckToken, firebaseConfigStatus };
