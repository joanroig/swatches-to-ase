import type { CloudUser, DiscoverySort, ExportMode, Palette, PublicPalette } from "./types";

export const state = {
  processing: false,
  palettes: [] as Palette[],
  activePaletteId: "" as string | null,
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
};
