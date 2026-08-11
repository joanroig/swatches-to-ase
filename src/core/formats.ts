export const VALID_NAME_FORMATS = ["roygbiv", "basic", "html", "x11", "pantone", "ntc"] as const;

export const getValidFormats = (): string[] => [...VALID_NAME_FORMATS];

export const getSupportedPaletteFormats = () => ["swatches", "ase", "gpl"] as const;
