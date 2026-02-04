import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import type { AvatarColors } from "../types";
import { generateAvatarColors, isAvatarColors, normalizeAvatarColors } from "./avatars";
import { firebaseClient } from "./context";

const PROFILE_COLLECTION = "profile";
const PROFILE_DOC_ID = "avatar";

const getProfileRef = (uid: string) =>
  firebaseClient ? doc(firebaseClient.db, "users", uid, PROFILE_COLLECTION, PROFILE_DOC_ID) : null;

export const fetchUserAvatar = async (uid: string): Promise<AvatarColors | null> => {
  const ref = getProfileRef(uid);
  if (!ref) {
    return null;
  }
  try {
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return null;
    }
    const data = snapshot.data() as { avatar?: unknown } | undefined;
    if (data && isAvatarColors(data.avatar)) {
      return normalizeAvatarColors(data.avatar);
    }
  } catch (error) {
    console.warn("[cloud] Failed to read avatar profile.", error);
  }
  return null;
};

export const ensureUserAvatar = async (uid: string): Promise<AvatarColors> => {
  const existing = await fetchUserAvatar(uid);
  if (existing) {
    return existing;
  }
  const generated = generateAvatarColors();
  try {
    await saveUserAvatar(uid, generated);
  } catch (error) {
    console.warn("[cloud] Failed to create avatar profile.", error);
  }
  return generated;
};

export const saveUserAvatar = async (uid: string, avatar: AvatarColors) => {
  const ref = getProfileRef(uid);
  if (!ref) {
    return;
  }
  const normalized = normalizeAvatarColors(avatar);
  await setDoc(ref, { avatar: normalized, updatedAt: serverTimestamp() }, { merge: true });
};
