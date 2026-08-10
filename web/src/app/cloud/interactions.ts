import { collection, deleteDoc, doc, getDocs, increment, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

import { formatSelect } from "../dom";
import { t } from "../i18n";
import { nameColor, resolveNameFormat } from "../palette/naming";
import { syncActivePalette } from "../palette/ui";
import { cloudState, discoveryState, state } from "../state";
import type { Palette, PublicPalette } from "../types";
import { showToast } from "../ui/notifications";
import { rgbToHex } from "../utils/color";
import { createId } from "../utils/id";
import { trackEvent } from "./analytics";
import { firebaseClient } from "./context";
import { logCloudError, reportCloudError } from "./errors";
import { requireVerifiedCloudUser } from "./verification";

/**
 * Guards against a second click landing while the first round-trip is still open. Without it a
 * double click sends two counter increments for one intent.
 */
const inFlight = new Set<string>();

export const isPaletteSaved = (paletteId: string) => discoveryState.savedIds.has(paletteId);
export const isPaletteLiked = (paletteId: string) => discoveryState.likedIds.has(paletteId);
export const isOwnPalette = (palette: PublicPalette) => Boolean(cloudState.user && palette.ownerId === cloudState.user.uid);

/**
 * Saving takes a full, independent copy rather than a reference. That is what lets a saver keep
 * their palette after the original author deletes theirs.
 */
const createLocalPaletteCopy = (palette: PublicPalette): Palette => {
  const nameFormat = resolveNameFormat(formatSelect?.value ?? "pantone");
  return {
    id: createId(),
    name: palette.name,
    colors: palette.colors.map((color, index) => ({
      id: createId(),
      name: nameColor(rgbToHex(color.rgb).toUpperCase(), nameFormat, index),
      rgb: [...color.rgb] as [number, number, number],
    })),
    lastModified: Date.now(),
  };
};

export type SaveResult = "saved" | "already-saved" | "blocked";

export type SaveContext = {
  /** The palette belongs to the signed-in user. */
  isOwner: boolean;
  /** This device has already saved the palette. */
  isSaved: boolean;
  /** A save for this palette is already in flight. */
  isBusy: boolean;
};

/**
 * The rule behind "clicking Save again must not increase the count", kept pure so it can be
 * tested without Firebase or the DOM.
 */
export const decideSaveAction = ({ isOwner, isSaved, isBusy }: SaveContext): SaveResult => {
  if (isOwner) {
    return "blocked";
  }
  if (isSaved) {
    return "already-saved";
  }
  if (isBusy) {
    return "blocked";
  }
  return "saved";
};

export type LikeAction = "like" | "unlike" | "blocked";

/** Liking is a toggle, but never for your own palette and never while a write is in flight. */
export const decideLikeAction = ({ isOwner, isLiked, isBusy }: { isOwner: boolean; isLiked: boolean; isBusy: boolean }): LikeAction => {
  if (isOwner || isBusy) {
    return "blocked";
  }
  return isLiked ? "unlike" : "like";
};

/**
 * Save a public palette into the local library.
 *
 * Idempotent by design: a palette that is already saved neither copies again nor moves the
 * counter, however many times the button is pressed.
 */
export const savePublicPalette = async (palette: PublicPalette): Promise<{ result: SaveResult; copy: Palette | null }> => {
  const guardKey = `save:${palette.id}`;
  const decision = decideSaveAction({
    isOwner: isOwnPalette(palette),
    isSaved: isPaletteSaved(palette.id),
    isBusy: inFlight.has(guardKey),
  });
  if (decision === "already-saved") {
    showToast(t("toast.paletteAlreadySaved"), "info");
    return { result: "already-saved", copy: null };
  }
  if (decision === "blocked") {
    return { result: "blocked", copy: null };
  }
  inFlight.add(guardKey);

  // Mark it saved up front so a burst of clicks collapses into one save.
  discoveryState.savedIds.add(palette.id);

  try {
    const copy = createLocalPaletteCopy(palette);
    trackEvent("palette_saved_from_discover", { colors: palette.colors.length });
    state.palettes.unshift(copy);
    syncActivePalette(copy.id);
    showToast(t("toast.paletteSaved"), "success");

    if (!firebaseClient || !cloudState.user) {
      // Signed out: the copy is local-only, so there is no counter to move.
      return { result: "saved", copy };
    }
    if (!requireVerifiedCloudUser()) {
      return { result: "saved", copy };
    }

    try {
      await setDoc(doc(firebaseClient.db, "users", cloudState.user.uid, "saves", palette.id), {
        savedAt: serverTimestamp(),
      });
      await updateDoc(doc(firebaseClient.db, "publicPalettes", palette.id), { savesCount: increment(1) });
      palette.savesCount = (palette.savesCount ?? 0) + 1;
    } catch (error) {
      // The local copy is the user's; keep it. Only the shared counter failed.
      logCloudError("Save palette", error, { paletteId: palette.id });
      showToast(t("toast.paletteSaveFailed"), "error");
    }
    return { result: "saved", copy };
  } finally {
    inFlight.delete(guardKey);
  }
};

export const toggleLikePublicPalette = async (palette: PublicPalette) => {
  if (isOwnPalette(palette)) {
    return;
  }
  if (!firebaseClient || !cloudState.user) {
    showToast(t("toast.signInToLike"), "info");
    return;
  }
  if (!requireVerifiedCloudUser()) {
    return;
  }
  const guardKey = `like:${palette.id}`;
  if (inFlight.has(guardKey)) {
    return;
  }
  inFlight.add(guardKey);

  const wasLiked = discoveryState.likedIds.has(palette.id);
  trackEvent("palette_liked", { liked: !discoveryState.likedIds.has(palette.id) });
  const previousCount = palette.likesCount ?? 0;

  // Optimistic: flip locally first so the UI responds immediately, then roll back on failure.
  if (wasLiked) {
    discoveryState.likedIds.delete(palette.id);
    palette.likesCount = Math.max(0, previousCount - 1);
  } else {
    discoveryState.likedIds.add(palette.id);
    palette.likesCount = previousCount + 1;
  }

  try {
    const likeDoc = doc(firebaseClient.db, "users", cloudState.user.uid, "likes", palette.id);
    const paletteDoc = doc(firebaseClient.db, "publicPalettes", palette.id);
    if (wasLiked) {
      await deleteDoc(likeDoc);
      await updateDoc(paletteDoc, { likesCount: increment(-1) });
    } else {
      await setDoc(likeDoc, { likedAt: serverTimestamp() });
      await updateDoc(paletteDoc, { likesCount: increment(1) });
    }
  } catch (error) {
    if (wasLiked) {
      discoveryState.likedIds.add(palette.id);
    } else {
      discoveryState.likedIds.delete(palette.id);
    }
    palette.likesCount = previousCount;
    reportCloudError("Toggle like", error, "toast.likeFailed");
  } finally {
    inFlight.delete(guardKey);
  }
};

export const fetchUserInteractions = async () => {
  if (!firebaseClient || !cloudState.user) {
    discoveryState.likedIds.clear();
    discoveryState.savedIds.clear();
    return;
  }
  try {
    const [likesSnapshot, savesSnapshot] = await Promise.all([
      getDocs(collection(firebaseClient.db, "users", cloudState.user.uid, "likes")),
      getDocs(collection(firebaseClient.db, "users", cloudState.user.uid, "saves")),
    ]);
    discoveryState.likedIds = new Set(likesSnapshot.docs.map((entry) => entry.id));
    discoveryState.savedIds = new Set(savesSnapshot.docs.map((entry) => entry.id));
  } catch (error) {
    // Not fatal: Discover still works, the user's own like/save marks are just unknown.
    logCloudError("Load user interactions", error);
  }
};
