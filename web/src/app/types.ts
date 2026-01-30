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
