import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { persistPalettes } from "../persistence";
import { cloudState } from "../state";
import type { Palette } from "../types";
import { createId } from "../utils/id";
import { firebaseClient } from "./context";
import { upsertPublicProfile } from "./follow";
import { isCloudUserVerified } from "./verification";

const PUBLIC_SYNC_COOLDOWN_MS = 2500;

export const upsertPublicPalette = async (palette: Palette) => {
  if (!firebaseClient || !cloudState.user || !palette.isPublic || !isCloudUserVerified()) {
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
  cloudState.publicSyncCooldownUntil = Math.max(cloudState.publicSyncCooldownUntil, Date.now() + PUBLIC_SYNC_COOLDOWN_MS);
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
  // Keep the public profile in step so the author shown beside a palette is followable.
  await upsertPublicProfile(cloudState.user.name, cloudState.user.avatar ?? null);
};

export const removePublicPalette = async (palette: Palette) => {
  const publicId = palette.publicId ?? null;
  if (!firebaseClient || !cloudState.user || !publicId) {
    return;
  }
  await deleteDoc(doc(firebaseClient.db, "publicPalettes", publicId));
};

export const unlinkPublicPalette = (palette: Palette) => {
  palette.isPublic = false;
  palette.publicId = null;
};

/**
 * Withdraw a palette from Discover.
 *
 * The remote document is deleted *before* the local link is cleared. Clearing first meant that a
 * failed delete orphaned the public copy forever: the owner no longer held its id, so they could
 * never retry. Anyone who saved the palette keeps their own copy either way — saves are
 * independent duplicates, not references to this document.
 */
export const unpublishPalette = async (palette: Palette, options: { persist?: boolean } = {}) => {
  const publicId = palette.publicId ?? null;
  if (firebaseClient && cloudState.user && publicId) {
    await deleteDoc(doc(firebaseClient.db, "publicPalettes", publicId));
  }
  unlinkPublicPalette(palette);
  if (options.persist !== false) {
    persistPalettes();
  }
};
