import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";

import { cloudState } from "../state";
import type { Palette } from "../types";
import { createId } from "../utils/id";
import { persistPalettes } from "../persistence";
import { firebaseClient } from "./context";

export const upsertPublicPalette = async (palette: Palette) => {
  if (!firebaseClient || !cloudState.user || !palette.isPublic) {
    return;
  }
  const isNew = !palette.publicId;
  const publicId = palette.publicId ?? createId();
  if (isNew) {
    palette.publicId = publicId;
    persistPalettes();
  }
  const payload = {
    name: palette.name,
    colors: palette.colors,
    ownerId: cloudState.user.uid,
    ownerName: cloudState.user.name,
    ownerPhoto: cloudState.user.photoUrl ?? null,
    updatedAt: serverTimestamp(),
    ...(isNew
      ? { createdAt: serverTimestamp(), likesCount: 0, savesCount: 0 }
      : {}),
  };
  await setDoc(doc(firebaseClient.db, "publicPalettes", publicId), payload, {
    merge: true,
  });
};

export const removePublicPalette = async (palette: Palette) => {
  if (!firebaseClient || !cloudState.user || !palette.publicId) {
    return;
  }
  await deleteDoc(doc(firebaseClient.db, "publicPalettes", palette.publicId));
};
