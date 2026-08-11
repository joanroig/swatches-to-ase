export type LogTone = "info" | "success" | "error";

export type PaletteColor = {
  id: string;
  name: string;
  rgb: [number, number, number];
};

export type StoredPaletteColor = {
  id: string;
  rgb: [number, number, number];
};

export type PublicPaletteColor = {
  rgb: [number, number, number];
};

export type Palette = {
  id: string;
  name: string;
  colors: PaletteColor[];
  lastModified?: number;
  isPublic?: boolean;
  publicId?: string | null;
  /** `null` or absent means the palette sits in the unfiled section. */
  folderId?: string | null;
};

export type Folder = {
  id: string;
  name: string;
};

/** Canonical palette shape written to Firestore. Local palettes stay looser for v3 migrations. */
export type StoredPalette = Pick<Palette, "id" | "name"> & {
  colors: StoredPaletteColor[];
  lastModified: number;
  isPublic: boolean;
  publicId: string | null;
  folderId: string | null;
};

export type Preferences = {
  theme: string;
  colorNameFormat: string;
  addBlackWhite: boolean;
  exportFormat: string;
  colorNotation: string;
  generateStyle?: string;
  motion?: "system" | "on" | "off";
  language?: "system" | "en" | "es";
};

/** Cloud sync starts with v4, so its first published schema stores every current preference. */
export type StoredPreferences = Required<Preferences>;

export type ExportMode = "single" | "batch";

export type QuickViewLayout = "details" | "blocks";

export type DiscoverySort = "recent" | "likes-desc" | "likes-asc" | "saves-desc" | "saves-asc";

export type AvatarColors = {
  background: string;
  foreground: string;
};

export type CloudUser = {
  uid: string;
  name: string;
  email?: string | null;
  emailVerified?: boolean;
  avatar?: AvatarColors | null;
};

/** The public face of an account: what other people can see and follow. */
export type PublicProfile = {
  uid: string;
  name: string | null;
  avatar: AvatarColors | null;
  followersCount: number;
};

export type PublicPalette = {
  id: string;
  name: string;
  colors: PublicPaletteColor[];
  ownerId: string;
  ownerName?: string | null;
  ownerAvatar?: AvatarColors | null;
  createdAt?: number | null;
  likesCount?: number;
  savesCount?: number;
};

export type StoredSyncPayload = {
  palettes: StoredPalette[];
  folders: Folder[];
  libraryOrder: string[];
  activePaletteId: string | null;
  preferences: StoredPreferences;
  revision: string;
};

export type SyncPayload = {
  palettes: Palette[];
  folders: Folder[];
  libraryOrder: string[];
  activePaletteId: string | null;
  preferences: StoredPreferences;
  revision: string;
};

export type SharedPalettePayload = {
  name?: string;
  colors?: Array<{
    name?: string;
    hex: string;
  }>;
};

export type SharedWorkspacePayload = {
  version?: number;
  user?: {
    name?: string | null;
  };
  palettes?: Array<{
    name?: string;
    colors?: Array<{
      name?: string;
      hex: string;
    }>;
  }>;
  preferences?: Preferences;
  activePaletteIndex?: number | null;
};

export type StyleRanges = {
  s: [number, number];
  l: [number, number];
  isShade?: boolean;
};
