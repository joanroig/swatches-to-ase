import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";

import { discoverEmpty, discoverList } from "../dom";
import { t } from "../i18n";
import { openViewForPublicPalette } from "../palette/ui";
import { discoveryState } from "../state";
import type { DiscoverySort, PublicPalette, PublicPaletteColor } from "../types";
import { isAvatarColors, normalizeAvatarColors } from "./avatars";
import { firebaseClient } from "./context";
import { createDiscoveryCard, createDiscoverySkeleton } from "./discovery-card";
import { openDiscoveryProfile, refreshDiscoveryProfileIfOpen, setDiscoveryProfileHandlers } from "./discovery-profile";
import { logCloudError } from "./errors";

/** Bounded so a large public collection cannot turn into an unbounded live query. */
const DISCOVERY_PAGE_SIZE = 120;
const DISCOVERY_PLACEHOLDER_COUNT = 8;
const DISCOVERY_SORT_OPTIONS: DiscoverySort[] = ["recent", "likes-desc", "likes-asc", "saves-desc", "saves-asc"];

let discoveryUnsubscribe: (() => void) | null = null;
let hasLoadError = false;

const isRgbTuple = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((channel) => typeof channel === "number");

const isPublicPaletteColor = (value: unknown): value is PublicPaletteColor =>
  Boolean(value) && typeof value === "object" && isRgbTuple((value as PublicPaletteColor).rgb);

const isDiscoverySort = (value: string): value is DiscoverySort => (DISCOVERY_SORT_OPTIONS as string[]).includes(value);

/** `recent` is already the query order, so only the count sorts need client-side work. */
export const sortDiscoveryPalettes = (palettes: PublicPalette[], sort: DiscoverySort = discoveryState.sort) => {
  if (sort === "recent") {
    return palettes;
  }
  const ranked = palettes.map((palette, index) => ({ palette, index }));
  ranked.sort((a, b) => {
    const likesA = a.palette.likesCount ?? 0;
    const likesB = b.palette.likesCount ?? 0;
    const savesA = a.palette.savesCount ?? 0;
    const savesB = b.palette.savesCount ?? 0;
    let diff: number;
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
    // Stable: equal counts keep the recency order from the query.
    return diff !== 0 ? diff : a.index - b.index;
  });
  return ranked.map(({ palette }) => palette);
};

const matchesDiscoverySearch = (palette: PublicPalette, searchQuery: string) => {
  if (!searchQuery) {
    return true;
  }
  return palette.name.toLowerCase().includes(searchQuery) || (palette.ownerName?.toLowerCase() ?? "").includes(searchQuery);
};

export const renderDiscovery = () => {
  if (!discoverList || !discoverEmpty) {
    return;
  }
  discoverList.innerHTML = "";
  const hasRemoteItems = discoveryState.palettes.length > 0;

  if (discoveryState.loading && !hasRemoteItems) {
    discoverEmpty.classList.add("is-hidden");
    for (let index = 0; index < DISCOVERY_PLACEHOLDER_COUNT; index += 1) {
      discoverList.appendChild(createDiscoverySkeleton());
    }
    return;
  }

  const searchQuery = discoveryState.search.trim().toLowerCase();
  const palettes = sortDiscoveryPalettes(discoveryState.palettes);
  const bySearch = searchQuery ? palettes.filter((palette) => matchesDiscoverySearch(palette, searchQuery)) : palettes;
  const filtered = discoveryState.followingOnly ? bySearch.filter((palette) => discoveryState.followingIds.has(palette.ownerId)) : bySearch;

  discoverEmpty.textContent = hasLoadError
    ? t("toast.discoveryLoadFailed")
    : discoveryState.followingOnly
      ? t("discover.emptyFollowing")
      : searchQuery
        ? t("discover.emptySearch")
        : t("discover.empty");
  discoverEmpty.classList.toggle("is-hidden", filtered.length > 0);

  filtered.forEach((palette) => {
    discoverList.appendChild(
      createDiscoveryCard(palette, {
        onProfileClick: openDiscoveryProfile,
        onOpen: openViewForPublicPalette,
        onChanged: renderDiscovery,
      }),
    );
  });
  refreshDiscoveryProfileIfOpen();
};

setDiscoveryProfileHandlers({
  sortPalettes: (palettes) => sortDiscoveryPalettes(palettes),
  onOpenPalette: openViewForPublicPalette,
  onChanged: renderDiscovery,
});

export const setDiscoverySort = (value: string) => {
  discoveryState.sort = isDiscoverySort(value) ? value : "recent";
  renderDiscovery();
};

export const setDiscoverySearch = (value: string) => {
  discoveryState.search = value;
  renderDiscovery();
};

export const setDiscoveryFollowingOnly = (value: boolean) => {
  discoveryState.followingOnly = value;
  renderDiscovery();
};

export const listenToDiscovery = () => {
  if (!firebaseClient) {
    return;
  }
  if (discoveryUnsubscribe) {
    discoveryUnsubscribe();
  }
  hasLoadError = false;
  discoveryState.loading = discoveryState.palettes.length === 0;
  const discoverQuery = query(collection(firebaseClient.db, "publicPalettes"), orderBy("updatedAt", "desc"), limit(DISCOVERY_PAGE_SIZE));
  discoveryUnsubscribe = onSnapshot(
    discoverQuery,
    (snapshot) => {
      hasLoadError = false;
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
    },
    (error) => {
      // Without this handler a rules or network failure silently leaves the skeletons up forever.
      logCloudError("Discovery listener", error);
      hasLoadError = true;
      discoveryState.loading = false;
      renderDiscovery();
    },
  );
};

export const stopListeningToDiscovery = () => {
  discoveryUnsubscribe?.();
  discoveryUnsubscribe = null;
};

export { fetchUserInteractions, savePublicPalette, toggleLikePublicPalette } from "./interactions";
export { setupDiscoveryProfileControls } from "./discovery-profile";
