declare module "color-namer/dist/color-namer.js" {
  const namer: (
    color: string,
    options?: { pick?: string[] }
  ) => Record<string, Array<{ name: string }>>;
  export default namer;
}

declare module "procreate-swatches" {
  export type SwatchesColor = [number[], string] | readonly [readonly number[], string];
  export type SwatchesEntry = SwatchesColor | null;
  export type SwatchesResult = {
    name: string;
    colors: SwatchesEntry[];
  };

  export function readSwatchesFile(
    data: ArrayBuffer | Uint8Array,
    space?: string
  ): Promise<SwatchesResult>;
  export function createSwatchesFile(
    name: string,
    colors: ReadonlyArray<SwatchesEntry>,
    format?: "uint8array" | "buffer" | "blob"
  ): Promise<Uint8Array>;
}
