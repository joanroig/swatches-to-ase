import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { discoverEmpty, discoverList, formatSelect } from "../dom";
import { syncActivePalette } from "../palette/ui";
import { cloudState, discoveryState, state } from "../state";
import type { Palette, PublicPalette, PublicPaletteColor } from "../types";
import { t } from "../i18n";
import { setButtonContent } from "../ui/icons";
import { showToast } from "../ui/notifications";
import { rgbToHex } from "../utils/color";
import { createId } from "../utils/id";
import { nameColor, resolveNameFormat } from "../palette/naming";
import { firebaseClient } from "./context";
import { isAvatarColors, normalizeAvatarColors } from "./avatars";

let discoveryUnsubscribe: (() => void) | null = null;

const isRgbTuple = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((channel) => typeof channel === "number");

const isPublicPaletteColor = (value: unknown): value is PublicPaletteColor => {
  if (!value || typeof value !== "object") {
    return false;
  }
  return isRgbTuple((value as PublicPaletteColor).rgb);
};

export const fetchUserInteractions = async () => {
  if (!firebaseClient || !cloudState.user) {
    discoveryState.likedIds.clear();
    discoveryState.savedIds.clear();
    return;
  }
  const likesSnapshot = await getDocs(collection(firebaseClient.db, "users", cloudState.user.uid, "likes"));
  discoveryState.likedIds = new Set(likesSnapshot.docs.map((doc) => doc.id));
  const savesSnapshot = await getDocs(collection(firebaseClient.db, "users", cloudState.user.uid, "saves"));
  discoveryState.savedIds = new Set(savesSnapshot.docs.map((doc) => doc.id));
};

export const renderDiscovery = () => {
  if (!discoverList || !discoverEmpty) {
    return;
  }
  discoverList.innerHTML = "";
  const hasItems = discoveryState.palettes.length > 0;
  discoverEmpty.classList.toggle("is-hidden", hasItems);

  if (!hasItems) {
    return;
  }

  discoveryState.palettes.forEach((palette) => {
    const card = document.createElement("article");
    card.className = "discover-card";

    const header = document.createElement("div");
    header.className = "discover-header";
    const title = document.createElement("div");
    title.className = "discover-title";
    title.textContent = palette.name;
    const author = document.createElement("div");
    author.className = "discover-author";
    author.textContent = palette.ownerName ? t("discover.by", { name: palette.ownerName }) : t("discover.shared");
    header.append(title, author);

    const strip = document.createElement("div");
    strip.className = "discover-strip";
    palette.colors.slice(0, 6).forEach((color) => {
      const chip = document.createElement("span");
      chip.style.background = rgbToHex(color.rgb);
      strip.appendChild(chip);
    });

    const stats = document.createElement("div");
    stats.className = "discover-stats";
    const likes = document.createElement("span");
    likes.className = "discover-stat";
    likes.textContent = t("discover.likes", { count: palette.likesCount ?? 0 });
    const saves = document.createElement("span");
    saves.className = "discover-stat";
    saves.textContent = t("discover.saves", { count: palette.savesCount ?? 0 });
    stats.append(likes, saves);

    const actions = document.createElement("div");
    actions.className = "discover-actions";
    const saveButton = document.createElement("button");
    saveButton.className = "ghost";
    setButtonContent(saveButton, "bookmark", discoveryState.savedIds.has(palette.id) ? t("action.saved") : t("action.save"));
    if (discoveryState.savedIds.has(palette.id)) {
      saveButton.classList.add("is-active");
    }
    saveButton.addEventListener("click", async () => {
      const nameFormat = resolveNameFormat(formatSelect?.value ?? "pantone");
      const copy: Palette = {
        id: createId(),
        name: palette.name,
        colors: palette.colors.map((color, index) => ({
          id: createId(),
          name: nameColor(rgbToHex(color.rgb).toUpperCase(), nameFormat, index),
          rgb: [...color.rgb] as [number, number, number],
        })),
      };
      state.palettes.unshift(copy);
      syncActivePalette(copy.id);
      showToast(t("toast.paletteSaved"), "success");
      if (!firebaseClient || !cloudState.user) {
        return;
      }
      await setDoc(doc(firebaseClient.db, "users", cloudState.user.uid, "saves", palette.id), {
        savedAt: serverTimestamp(),
      });
      await updateDoc(doc(firebaseClient.db, "publicPalettes", palette.id), { savesCount: increment(1) });
      discoveryState.savedIds.add(palette.id);
      renderDiscovery();
    });

    const likeButton = document.createElement("button");
    likeButton.className = "ghost";
    setButtonContent(likeButton, "heart", discoveryState.likedIds.has(palette.id) ? t("action.liked") : t("action.like"));
    if (discoveryState.likedIds.has(palette.id)) {
      likeButton.classList.add("is-active");
    }
    likeButton.addEventListener("click", async () => {
      if (!firebaseClient || !cloudState.user) {
        showToast(t("toast.signInToLike"), "info");
        return;
      }
      const likeDoc = doc(firebaseClient.db, "users", cloudState.user.uid, "likes", palette.id);
      if (discoveryState.likedIds.has(palette.id)) {
        await deleteDoc(likeDoc);
        await updateDoc(doc(firebaseClient.db, "publicPalettes", palette.id), { likesCount: increment(-1) });
        discoveryState.likedIds.delete(palette.id);
      } else {
        await setDoc(likeDoc, { likedAt: serverTimestamp() });
        await updateDoc(doc(firebaseClient.db, "publicPalettes", palette.id), { likesCount: increment(1) });
        discoveryState.likedIds.add(palette.id);
      }
      renderDiscovery();
    });

    actions.append(saveButton, likeButton);

    card.append(header, strip, stats, actions);
    discoverList.appendChild(card);
  });
};

export const listenToDiscovery = () => {
  if (!firebaseClient) {
    return;
  }
  if (discoveryUnsubscribe) {
    discoveryUnsubscribe();
  }
  discoveryState.loading = true;
  const discoverQuery = query(collection(firebaseClient.db, "publicPalettes"), orderBy("updatedAt", "desc"));
  discoveryUnsubscribe = onSnapshot(discoverQuery, (snapshot) => {
    discoveryState.palettes = snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as PublicPalette;
      return {
        id: docSnap.id,
        name: data.name ?? t("palette.untitled"),
        colors: Array.isArray(data.colors) ? data.colors.filter(isPublicPaletteColor) : [],
        ownerId: data.ownerId ?? "",
        ownerName: data.ownerName ?? null,
        ownerAvatar: isAvatarColors(data.ownerAvatar) ? normalizeAvatarColors(data.ownerAvatar) : null,
        createdAt: data.createdAt ?? null,
        likesCount: data.likesCount ?? 0,
        savesCount: data.savesCount ?? 0,
      };
    });
    discoveryState.loading = false;
    renderDiscovery();
  });
};
