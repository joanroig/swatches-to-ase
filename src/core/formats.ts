export const VALID_NAME_FORMATS = ["roygbiv", "basic", "html", "x11", "pantone", "ntc"] as const;

export const getValidFormats = (): string[] => [...VALID_NAME_FORMATS];

/** Formats a palette can be written to. */
export const getSupportedPaletteFormats = () => ["swatches", "ase", "gpl"] as const;

/**
 * Extensions a palette can be read from.
 *
 * A superset of the writable ones: reading someone else's file costs a parser, while writing a
 * format commits the app to being a good citizen of the tool that owns it.
 */
export const IMPORTABLE_PALETTE_EXTENSIONS = [
  "swatches",
  "ase",
  "gpl",
  "aco",
  "act",
  "pal",
  "sketchpalette",
  "json",
  "css",
  "scss",
  "less",
  "hex",
  "txt",
] as const;

export type ImportablePaletteExtension = (typeof IMPORTABLE_PALETTE_EXTENSIONS)[number];

export const getImportablePaletteFormats = (): string[] => [...IMPORTABLE_PALETTE_EXTENSIONS];
