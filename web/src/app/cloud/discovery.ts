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

import {
  discoverEmpty,
  discoverList,
  discoverProfileAvatar,
  discoverProfileEmpty,
  discoverProfileList,
  discoverProfileModal,
  discoverProfileName,
  discoverProfileStats,
  formatSelect,
} from "../dom";
import { openViewForPublicPalette, syncActivePalette } from "../palette/ui";
import { cloudState, discoveryState, state } from "../state";
import type { AvatarColors, DiscoverySort, Palette, PublicPalette, PublicPaletteColor } from "../types";
import { t } from "../i18n";
import { setButtonContent } from "../ui/icons";
import { setModalOpen } from "../ui/modals";
import { showToast } from "../ui/notifications";
import { rgbToHex } from "../utils/color";
import { createId } from "../utils/id";
import { nameColor, resolveNameFormat } from "../palette/naming";
import { firebaseClient } from "./context";
import { getCloudAvatarSrc, isAvatarColors, normalizeAvatarColors } from "./avatars";
import { requireVerifiedCloudUser } from "./verification";

let discoveryUnsubscribe: (() => void) | null = null;
const DISCOVERY_PLACEHOLDER_COUNT = 8;
const DISCOVERY_SORT_OPTIONS: DiscoverySort[] = ["recent", "likes-desc", "likes-asc", "saves-desc", "saves-asc"];
const countFormatter = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
let activeProfileOwnerId: string | null = null;
let activeProfileOwnerName: string | null = null;
let activeProfileOwnerAvatar: AvatarColors | null = null;

const isRgbTuple = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((channel) => typeof channel === "number");

const isPublicPaletteColor = (value: unknown): value is PublicPaletteColor => {
  if (!value || typeof value !== "object") {
    return false;
  }
  return isRgbTuple((value as PublicPaletteColor).rgb);
};

const isDiscoverySort = (value: string): value is DiscoverySort =>
  (DISCOVERY_SORT_OPTIONS as string[]).includes(value);

const sortDiscoveryPalettes = (palettes: PublicPalette[], sort: DiscoverySort) => {
  if (sort === "recent") {
    return palettes;
  }
  const ranked = palettes.map((palette, index) => ({ palette, index }));
  ranked.sort((a, b) => {
    const likesA = a.palette.likesCount ?? 0;
    const likesB = b.palette.likesCount ?? 0;
    const savesA = a.palette.savesCount ?? 0;
    const savesB = b.palette.savesCount ?? 0;
    let diff = 0;
    switch (sort) {
      case "likes-desc":
        diff = likesB - likesA;
        break;
      case "likes-asc":
        diff = likesA - likesB;
        break;
      case "saves-desc":
        diff = savesB - savesA;
        break;
      case "saves-asc":
        diff = savesA - savesB;
        break;
      default:
        diff = 0;
    }
    if (diff !== 0) {
      return diff;
    }
    return a.index - b.index;
  });
  return ranked.map(({ palette }) => palette);
};

const formatCount = (value: number) => countFormatter.format(Math.max(0, value));

const isProfileModalOpen = () => discoverProfileModal?.getAttribute("aria-hidden") === "false";

const resolveProfileOwnerName = () => {
  const fallback = t("cloud.profile.name.placeholder");
  return activeProfileOwnerName?.trim() || fallback;
};

const normalizeDiscoveryQuery = (value: string) => value.trim().toLowerCase();

const matchesDiscoverySearch = (palette: PublicPalette, query: string) => {
  if (!query) {
    return true;
  }
  const name = palette.name.toLowerCase();
  const owner = palette.ownerName?.toLowerCase() ?? "";
  return name.includes(query) || owner.includes(query);
};

const createDiscoverySkeleton = () => {
  const card = document.createElement("article");
  card.className = "discover-card is-skeleton";
  card.setAttribute("aria-hidden", "true");

  const header = document.createElement("div");
  header.className = "discover-header";
  const title = document.createElement("div");
  title.className = "discover-skeleton discover-skeleton-title";
  const author = document.createElement("div");
  author.className = "discover-skeleton discover-skeleton-author";
  header.append(title, author);

  const strip = document.createElement("div");
  strip.className = "discover-strip discover-strip--skeleton";
  for (let index = 0; index < 6; index += 1) {
    const chip = document.createElement("span");
    chip.className = "discover-skeleton-swatch";
    strip.appendChild(chip);
  }

  const footer = document.createElement("div");
  footer.className = "discover-footer";
  const likeGroup = document.createElement("div");
  likeGroup.className = "discover-like";
  const likeIcon = document.createElement("span");
  likeIcon.className = "discover-skeleton discover-skeleton-icon";
  const likeCount = document.createElement("span");
  likeCount.className = "discover-skeleton discover-skeleton-count";
  likeGroup.append(likeIcon, likeCount);
  const saveIcon = document.createElement("span");
  saveIcon.className = "discover-skeleton discover-skeleton-icon";
  footer.append(likeGroup, saveIcon);

  card.append(header, strip, footer);
  return card;
};

const renderDiscoverySkeletons = (count = DISCOVERY_PLACEHOLDER_COUNT) => {
  if (!discoverList) {
    return;
  }
  for (let index = 0; index < count; index += 1) {
    discoverList.appendChild(createDiscoverySkeleton());
  }
};

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

type DiscoveryCardOptions = {
  showAuthor?: boolean;
  onProfileClick?: (palette: PublicPalette) => void;
};

const createDiscoveryCard = (palette: PublicPalette, options: DiscoveryCardOptions = {}) => {
  const card = document.createElement("article");
  card.className = "discover-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.addEventListener("click", () => {
    openViewForPublicPalette(palette);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openViewForPublicPalette(palette);
    }
  });

  const isOwner = Boolean(cloudState.user && palette.ownerId === cloudState.user.uid);

  const header = document.createElement("div");
  header.className = "discover-header";
  const title = document.createElement("div");
  title.className = "discover-title";
  title.textContent = palette.name;
  header.appendChild(title);

  const showAuthor = options.showAuthor !== false;
  if (showAuthor) {
    if (palette.ownerId) {
      const ownerLabel = palette.ownerName?.trim() || t("cloud.profile.name.placeholder");
      if (options.onProfileClick) {
        const authorButton = document.createElement("button");
        authorButton.type = "button";
        authorButton.className = "discover-author discover-author-button";
        authorButton.textContent = t("discover.by", { name: ownerLabel });
        const profileLabel = t("discover.profile.open", { name: ownerLabel });
        authorButton.setAttribute("aria-label", profileLabel);
        authorButton.setAttribute("title", profileLabel);
        authorButton.addEventListener("click", (event) => {
          event.stopPropagation();
          options.onProfileClick?.(palette);
        });
        authorButton.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.stopPropagation();
          }
        });
        header.appendChild(authorButton);
      } else {
        const author = document.createElement("div");
        author.className = "discover-author";
        author.textContent = t("discover.by", { name: ownerLabel });
        header.appendChild(author);
      }
    } else {
      const author = document.createElement("div");
      author.className = "discover-author";
      author.textContent = t("discover.shared");
      header.appendChild(author);
    }
  }

  const strip = document.createElement("div");
  strip.className = "discover-strip";
  palette.colors.slice(0, 6).forEach((color) => {
    const chip = document.createElement("span");
    chip.style.background = rgbToHex(color.rgb);
    strip.appendChild(chip);
  });

  const footer = document.createElement("div");
  footer.className = "discover-footer";

  const likeGroup = document.createElement("div");
  likeGroup.className = "discover-like";
  const saveButton = document.createElement("button");
  saveButton.className = "ghost icon-only discover-action";
  setButtonContent(
    saveButton,
    "bookmark",
    discoveryState.savedIds.has(palette.id) ? t("action.saved") : t("action.save"),
    true,
  );
  if (discoveryState.savedIds.has(palette.id)) {
    saveButton.classList.add("is-active");
  }
  if (isOwner) {
    saveButton.disabled = true;
  } else {
    saveButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await savePublicPalette(palette);
    });
  }

  const likeButton = document.createElement("button");
  likeButton.className = "ghost icon-only discover-action";
  setButtonContent(
    likeButton,
    "heart",
    discoveryState.likedIds.has(palette.id) ? t("action.liked") : t("action.like"),
    true,
  );
  if (discoveryState.likedIds.has(palette.id)) {
    likeButton.classList.add("is-active");
  }
  if (isOwner) {
    likeButton.disabled = true;
  } else {
    likeButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await toggleLikePublicPalette(palette);
    });
  }

  const likeCount = document.createElement("span");
  likeCount.className = "discover-like-count";
  likeCount.textContent = formatCount(palette.likesCount ?? 0);

  likeGroup.append(likeButton, likeCount);
  footer.append(likeGroup, saveButton);

  card.append(header, strip, footer);
  return card;
};

const getProfilePalettes = () => {
  if (!activeProfileOwnerId) {
    return [];
  }
  const palettes = sortDiscoveryPalettes(discoveryState.palettes, discoveryState.sort);
  return palettes.filter((palette) => palette.ownerId === activeProfileOwnerId);
};

const renderDiscoveryProfile = () => {
  if (
    !discoverProfileList ||
    !discoverProfileEmpty ||
    !discoverProfileName ||
    !discoverProfileAvatar ||
    !discoverProfileStats
  ) {
    return;
  }

  const palettes = getProfilePalettes();
  const hasItems = palettes.length > 0;

  if (!activeProfileOwnerName) {
    const withName = palettes.find((palette) => palette.ownerName);
    if (withName?.ownerName) {
      activeProfileOwnerName = withName.ownerName;
    }
  }

  if (!activeProfileOwnerAvatar) {
    const withAvatar = palettes.find((palette) => palette.ownerAvatar);
    if (withAvatar?.ownerAvatar) {
      activeProfileOwnerAvatar = withAvatar.ownerAvatar;
    }
  }

  const ownerName = resolveProfileOwnerName();
  discoverProfileName.textContent = ownerName;
  discoverProfileAvatar.src = getCloudAvatarSrc(activeProfileOwnerAvatar);
  discoverProfileAvatar.alt = ownerName;

  const totalLikes = palettes.reduce((sum, palette) => sum + (palette.likesCount ?? 0), 0);
  const totalSaves = palettes.reduce((sum, palette) => sum + (palette.savesCount ?? 0), 0);
  discoverProfileStats.textContent = t("discover.profile.stats", {
    count: formatCount(palettes.length),
    likes: formatCount(totalLikes),
    saves: formatCount(totalSaves),
  });

  discoverProfileList.innerHTML = "";
  discoverProfileEmpty.classList.toggle("is-hidden", hasItems);

  if (!hasItems) {
    return;
  }

  palettes.forEach((palette) => {
    discoverProfileList.appendChild(createDiscoveryCard(palette, { showAuthor: false }));
  });
};

const openDiscoveryProfile = (palette: PublicPalette) => {
  if (!discoverProfileModal || !palette.ownerId) {
    return;
  }
  activeProfileOwnerId = palette.ownerId;
  activeProfileOwnerName = palette.ownerName ?? null;
  activeProfileOwnerAvatar = palette.ownerAvatar ?? null;
  renderDiscoveryProfile();
  setModalOpen(discoverProfileModal, true);
};

const refreshProfileIfOpen = () => {
  if (isProfileModalOpen()) {
    renderDiscoveryProfile();
  }
};

export const savePublicPalette = async (palette: PublicPalette) => {
  const copy = createLocalPaletteCopy(palette);
  state.palettes.unshift(copy);
  syncActivePalette(copy.id);
  showToast(t("toast.paletteSaved"), "success");

  if (!firebaseClient || !cloudState.user) {
    return copy;
  }
  if (!requireVerifiedCloudUser()) {
    return copy;
  }
  await setDoc(doc(firebaseClient.db, "users", cloudState.user.uid, "saves", palette.id), {
    savedAt: serverTimestamp(),
  });
  await updateDoc(doc(firebaseClient.db, "publicPalettes", palette.id), { savesCount: increment(1) });
  discoveryState.savedIds.add(palette.id);
  palette.savesCount = (palette.savesCount ?? 0) + 1;
  renderDiscovery();
  refreshProfileIfOpen();
  return copy;
};

export const toggleLikePublicPalette = async (palette: PublicPalette) => {
  if (!firebaseClient || !cloudState.user) {
    showToast(t("toast.signInToLike"), "info");
    return;
  }
  if (!requireVerifiedCloudUser()) {
    return;
  }
  const likeDoc = doc(firebaseClient.db, "users", cloudState.user.uid, "likes", palette.id);
  if (discoveryState.likedIds.has(palette.id)) {
    await deleteDoc(likeDoc);
    await updateDoc(doc(firebaseClient.db, "publicPalettes", palette.id), { likesCount: increment(-1) });
    discoveryState.likedIds.delete(palette.id);
    palette.likesCount = Math.max(0, (palette.likesCount ?? 0) - 1);
  } else {
    await setDoc(likeDoc, { likedAt: serverTimestamp() });
    await updateDoc(doc(firebaseClient.db, "publicPalettes", palette.id), { likesCount: increment(1) });
    discoveryState.likedIds.add(palette.id);
    palette.likesCount = (palette.likesCount ?? 0) + 1;
  }
  renderDiscovery();
  refreshProfileIfOpen();
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
  const hasRemoteItems = discoveryState.palettes.length > 0;
  const isLoading = discoveryState.loading && !hasRemoteItems;

  if (isLoading) {
    discoverEmpty.classList.add("is-hidden");
    renderDiscoverySkeletons();
    return;
  }

  const query = normalizeDiscoveryQuery(discoveryState.search);
  const palettes = sortDiscoveryPalettes(discoveryState.palettes, discoveryState.sort);
  const filtered = query ? palettes.filter((palette) => matchesDiscoverySearch(palette, query)) : palettes;
  const hasItems = filtered.length > 0;

  discoverEmpty.textContent = query ? t("discover.emptySearch") : t("discover.empty");
  discoverEmpty.classList.toggle("is-hidden", hasItems);

  if (!hasItems) {
    refreshProfileIfOpen();
    return;
  }

  filtered.forEach((palette) => {
    discoverList.appendChild(createDiscoveryCard(palette, { onProfileClick: openDiscoveryProfile }));
  });
  refreshProfileIfOpen();
};

export const setDiscoverySort = (value: string) => {
  discoveryState.sort = isDiscoverySort(value) ? value : "recent";
  renderDiscovery();
};

export const setDiscoverySearch = (value: string) => {
  discoveryState.search = value;
  renderDiscovery();
};

export const listenToDiscovery = () => {
  if (!firebaseClient) {
    return;
  }
  if (discoveryUnsubscribe) {
    discoveryUnsubscribe();
  }
  discoveryState.loading = discoveryState.palettes.length === 0;
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
