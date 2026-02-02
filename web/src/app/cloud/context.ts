import { cloudState } from "../state";
import { getFirebaseClient, getFirebaseConfigStatus } from "./client";

export const firebaseClient = getFirebaseClient();
export const firebaseConfigStatus = getFirebaseConfigStatus();

cloudState.isConfigured = firebaseConfigStatus.isConfigured;
