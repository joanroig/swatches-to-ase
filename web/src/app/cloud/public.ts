import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { persistPalettes } from "../persistence";
import { cloudState } from "../state";
import type { Palette } from "../types";
import { createId } from "../utils/id";
import { firebaseClient } from "./context";

const PUBLIC_SYNC_COOLDOWN_MS = 2500;

export const upsertPublicPalette = async (palette: Palette) => {
  if (!firebaseClient || !cloudState.user || !palette.isPublic) {
    return;
  }
  const publicId = palette.publicId ?? createId();
  const docRef = doc(firebaseClient.db, "publicPalettes", publicId);
  let isNew = !palette.publicId;
  if (!isNew) {
    try {
      const snapshot = await getDoc(docRef);
      isNew = !snapshot.exists();
    } catch (error) {
      console.warn("[cloud] Failed to check public palette existence.", error);
    }
  }
  if (!palette.publicId) {
    palette.publicId = publicId;
    persistPalettes();
  }
  cloudState.publicSyncCooldownUntil = Math.max(
    cloudState.publicSyncCooldownUntil,
    Date.now() + PUBLIC_SYNC_COOLDOWN_MS,
  );
  cloudState.recentPublicUpserts.set(palette.id, Date.now());
  const payload = {
    name: palette.name,
    colors: palette.colors.map((color) => ({ rgb: color.rgb })),
    ownerId: cloudState.user.uid,
    ownerName: cloudState.user.name,
    ownerAvatar: cloudState.user.avatar ?? null,
    updatedAt: serverTimestamp(),
    ...(isNew ? { createdAt: serverTimestamp(), likesCount: 0, savesCount: 0 } : {}),
  };
  await setDoc(docRef, payload, {
    merge: true,
  });
};

export const removePublicPalette = async (palette: Palette) => {
  if (!firebaseClient || !cloudState.user || !palette.publicId) {
    return;
  }
  await deleteDoc(doc(firebaseClient.db, "publicPalettes", palette.publicId));
};
