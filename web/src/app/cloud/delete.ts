import { deleteUser } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, increment, query, updateDoc, where } from "firebase/firestore";

import { syncActivePalette } from "../palette/ui";
import { persistPalettes } from "../persistence";
import { cloudState, discoveryState, state } from "../state";
import { ensureAppCheckToken, firebaseClient } from "./context";
import { unlinkPublicPalette } from "./public";

export type DeleteAccountResult = "success" | "reauth" | "failed";

const getAuthErrorCode = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return null;
  }
  return (error as { code?: string }).code ?? null;
};

const clearLocalPublicFlags = () => {
  let changed = false;
  state.palettes.forEach((palette) => {
    if (palette.isPublic || palette.publicId) {
      unlinkPublicPalette(palette);
      changed = true;
    }
  });
  if (changed) {
    cloudState.applyingRemote = true;
    try {
      persistPalettes();
      syncActivePalette(state.activePaletteId);
    } finally {
      cloudState.applyingRemote = false;
    }
  }
};

const deleteUserStateDocs = async (uid: string) => {
  if (!firebaseClient) {
    return;
  }
  await Promise.allSettled([
    deleteDoc(doc(firebaseClient.db, "users", uid, "state", "app")),
    deleteDoc(doc(firebaseClient.db, "users", uid, "profile", "avatar")),
  ]);
};

const deleteUserInteractions = async (uid: string) => {
  if (!firebaseClient) {
    return;
  }
  const likesSnapshot = await getDocs(collection(firebaseClient.db, "users", uid, "likes"));
  const savesSnapshot = await getDocs(collection(firebaseClient.db, "users", uid, "saves"));
  const tasks: Promise<unknown>[] = [];

  likesSnapshot.docs.forEach((entry) => {
    tasks.push(deleteDoc(entry.ref));
    tasks.push(updateDoc(doc(firebaseClient.db, "publicPalettes", entry.id), { likesCount: increment(-1) }));
  });

  savesSnapshot.docs.forEach((entry) => {
    tasks.push(deleteDoc(entry.ref));
    tasks.push(updateDoc(doc(firebaseClient.db, "publicPalettes", entry.id), { savesCount: increment(-1) }));
  });

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
};

const deletePublicPalettes = async (uid: string) => {
  if (!firebaseClient) {
    return;
  }
  const ownedQuery = query(collection(firebaseClient.db, "publicPalettes"), where("ownerId", "==", uid));
  const ownedSnapshot = await getDocs(ownedQuery);
  if (ownedSnapshot.empty) {
    return;
  }
  await Promise.allSettled(ownedSnapshot.docs.map((entry) => deleteDoc(entry.ref)));
};

export const deleteCloudAccount = async (): Promise<DeleteAccountResult> => {
  if (!firebaseClient) {
    return "failed";
  }
  const currentUser = firebaseClient.auth.currentUser;
  if (!currentUser) {
    return "failed";
  }

  const appCheckReady = await ensureAppCheckToken(firebaseClient, true);
  if (!appCheckReady) {
    return "failed";
  }

  const uid = currentUser.uid;

  try {
    await deleteUserInteractions(uid);
    discoveryState.likedIds.clear();
    discoveryState.savedIds.clear();
    await deletePublicPalettes(uid);
    await deleteUserStateDocs(uid);
  } catch (error) {
    console.warn("[cloud] Failed to delete some cloud data.", error);
  }

  clearLocalPublicFlags();

  try {
    await deleteUser(currentUser);
    return "success";
  } catch (error) {
    const code = getAuthErrorCode(error);
    if (code === "auth/requires-recent-login" || code === "auth/user-token-expired") {
      return "reauth";
    }
    console.error("[cloud] Account deletion failed.", error);
    return "failed";
  }
};
