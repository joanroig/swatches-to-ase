export type LogTone = "info" | "success" | "error";

export type PaletteColor = {
  id: string;
  name: string;
  rgb: [number, number, number];
};

export type Palette = {
  id: string;
  name: string;
  colors: PaletteColor[];
  isPublic?: boolean;
  publicId?: string | null;
};

export type Preferences = {
  theme: string;
  colorNameFormat: string;
  addBlackWhite: boolean;
  exportFormat: string;
  colorNotation: string;
  autoRenameColors: boolean;
};

export type ExportMode = "single" | "batch";

export type CloudUser = {
  uid: string;
  name: string;
  email?: string | null;
  photoUrl?: string | null;
};

export type PublicPalette = {
  id: string;
  name: string;
  colors: PaletteColor[];
  ownerId: string;
  ownerName?: string | null;
  ownerPhoto?: string | null;
  createdAt?: number | null;
  likesCount?: number;
  savesCount?: number;
};

export type SyncPayload = {
  palettes: Palette[];
  activePaletteId: string | null;
  preferences: Preferences;
  revision: string;
};

export type SharedPalettePayload = {
  name?: string;
  colors?: Array<{
    name?: string;
    hex: string;
  }>;
};

export type StyleRanges = {
  s: [number, number];
  l: [number, number];
  isShade?: boolean;
};
