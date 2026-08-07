import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { t } from "../i18n";
import { cloudState, discoveryState } from "../state";
import type { AvatarColors, PublicProfile } from "../types";
import { showToast } from "../ui/notifications";
import { isAvatarColors, normalizeAvatarColors } from "./avatars";
import { firebaseClient } from "./context";
import { logCloudError, reportCloudError } from "./errors";
import { requireVerifiedCloudUser } from "./verification";

const PUBLIC_PROFILES = "publicProfiles";
const FOLLOWING = "following";

/** One in-flight follow per creator, so a double click cannot double-count. */
const inFlight = new Set<string>();

export const isFollowing = (uid: string) => discoveryState.followingIds.has(uid);

export const getFollowerCount = (uid: string) => discoveryState.followerCounts.get(uid) ?? 0;

/**
 * Publish (or refresh) the signed-in user's public profile.
 *
 * Called whenever a palette is published or the profile is edited, so the name and avatar shown
 * beside someone's palettes stay in step with their account without a background job.
 */
export const upsertPublicProfile = async (name: string | null, avatar: AvatarColors | null) => {
  if (!firebaseClient || !cloudState.user) {
    return;
  }
  const ref = doc(firebaseClient.db, PUBLIC_PROFILES, cloudState.user.uid);
  try {
    const snapshot = await getDoc(ref);
    const payload = {
      name: name?.trim() || null,
      avatar: avatar ?? null,
      updatedAt: serverTimestamp(),
      // `followersCount` belongs to other people's writes; only seed it on create.
      ...(snapshot.exists() ? {} : { followersCount: 0 }),
    };
    await setDoc(ref, payload, { merge: true });
  } catch (error) {
    logCloudError("Publish public profile", error);
  }
};

export const fetchPublicProfile = async (uid: string): Promise<PublicProfile | null> => {
  if (!firebaseClient) {
    return null;
  }
  try {
    const snapshot = await getDoc(doc(firebaseClient.db, PUBLIC_PROFILES, uid));
    if (!snapshot.exists()) {
      return null;
    }
    const data = snapshot.data() as { name?: unknown; avatar?: unknown; followersCount?: unknown };
    const profile: PublicProfile = {
      uid,
      name: typeof data.name === "string" ? data.name : null,
      avatar: isAvatarColors(data.avatar) ? normalizeAvatarColors(data.avatar) : null,
      followersCount: typeof data.followersCount === "number" ? Math.max(0, data.followersCount) : 0,
    };
    discoveryState.followerCounts.set(uid, profile.followersCount);
    return profile;
  } catch (error) {
    logCloudError("Load public profile", error, { uid });
    return null;
  }
};

export const fetchFollowing = async () => {
  if (!firebaseClient || !cloudState.user) {
    discoveryState.followingIds.clear();
    return;
  }
  try {
    const snapshot = await getDocs(collection(firebaseClient.db, "users", cloudState.user.uid, FOLLOWING));
    discoveryState.followingIds = new Set(snapshot.docs.map((entry) => entry.id));
  } catch (error) {
    // Not fatal: Discover still works, the follow buttons just start out unknown.
    logCloudError("Load following", error);
  }
};

export type FollowResult = "followed" | "unfollowed" | "blocked";

/**
 * Follow or unfollow a creator.
 *
 * Optimistic, with rollback: the button flips immediately and only reverts if the write fails.
 */
export const toggleFollow = async (uid: string): Promise<FollowResult> => {
  if (!uid) {
    return "blocked";
  }
  if (cloudState.user?.uid === uid) {
    // Following yourself is meaningless, and the rules reject it too.
    return "blocked";
  }
  if (!firebaseClient || !cloudState.user) {
    showToast(t("toast.signInToFollow"), "info");
    return "blocked";
  }
  if (!requireVerifiedCloudUser()) {
    return "blocked";
  }
  if (inFlight.has(uid)) {
    return "blocked";
  }
  inFlight.add(uid);

  const wasFollowing = isFollowing(uid);
  const previousCount = getFollowerCount(uid);

  if (wasFollowing) {
    discoveryState.followingIds.delete(uid);
    discoveryState.followerCounts.set(uid, Math.max(0, previousCount - 1));
  } else {
    discoveryState.followingIds.add(uid);
    discoveryState.followerCounts.set(uid, previousCount + 1);
  }

  try {
    const followDoc = doc(firebaseClient.db, "users", cloudState.user.uid, FOLLOWING, uid);
    const profileDoc = doc(firebaseClient.db, PUBLIC_PROFILES, uid);
    if (wasFollowing) {
      await deleteDoc(followDoc);
      await updateDoc(profileDoc, { followersCount: increment(-1) });
    } else {
      await setDoc(followDoc, { followedAt: serverTimestamp() });
      await updateDoc(profileDoc, { followersCount: increment(1) });
    }
    return wasFollowing ? "unfollowed" : "followed";
  } catch (error) {
    if (wasFollowing) {
      discoveryState.followingIds.add(uid);
    } else {
      discoveryState.followingIds.delete(uid);
    }
    discoveryState.followerCounts.set(uid, previousCount);
    reportCloudError("Toggle follow", error, "toast.followFailed");
    return "blocked";
  } finally {
    inFlight.delete(uid);
  }
};

/** Remove every follow edge owned by this account, for account deletion. */
export const deleteFollowData = async (uid: string) => {
  if (!firebaseClient) {
    return;
  }
  try {
    const snapshot = await getDocs(collection(firebaseClient.db, "users", uid, FOLLOWING));
    await Promise.allSettled([
      ...snapshot.docs.flatMap((entry) => [
        deleteDoc(entry.ref),
        updateDoc(doc(firebaseClient.db, PUBLIC_PROFILES, entry.id), { followersCount: increment(-1) }),
      ]),
      deleteDoc(doc(firebaseClient.db, PUBLIC_PROFILES, uid)),
    ]);
  } catch (error) {
    logCloudError("Delete follow data", error, { uid });
  }
};
