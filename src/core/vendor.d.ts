declare module "color-namer/dist/color-namer.js" {
  const namer: (color: string) => Record<string, Array<{ name: string }>>;
  export default namer;
}

declare module "procreate-swatches" {
  export function readSwatchesFile(
    data: ArrayBuffer | Uint8Array
  ): Promise<any>;
}
