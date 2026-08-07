import type { CloudUser, DiscoverySort, ExportMode, Folder, Palette, PublicPalette } from "./types";

export const state = {
  processing: false,
  palettes: [] as Palette[],
  folders: [] as Folder[],
  activePaletteId: "" as string | null,
};

/** Library view state. Not persisted to the cloud; collapse and search are per device. */
export const libraryState = {
  search: "",
  collapsedFolderIds: new Set<string>(),
};

export const exportState = {
  mode: "single" as ExportMode,
};

export const viewState = {
  paletteId: null as string | null,
  colorId: null as string | null,
  mode: "local" as "local" | "discover",
  publicPaletteId: null as string | null,
};

export const cloudState = {
  isConfigured: false,
  user: null as CloudUser | null,
  lastSyncedAt: null as string | null,
  isSyncing: false,
  lastRevision: null as string | null,
  applyingRemote: false,
  hasResolvedInitialSync: false,
  recentPublicUpserts: new Map<string, number>(),
  publicSyncCooldownUntil: 0,
};

export const discoveryState = {
  palettes: [] as PublicPalette[],
  likedIds: new Set<string>(),
  savedIds: new Set<string>(),
  loading: false,
  sort: "recent" as DiscoverySort,
  search: "",
  /** Creators the signed-in user follows. */
  followingIds: new Set<string>(),
  /** Follower counts by owner id, filled in lazily for creators shown in Discover. */
  followerCounts: new Map<string, number>(),
  /** Restrict the feed to creators the user follows. */
  followingOnly: false,
};
