declare module "ase-utils" {
  export function encode(data: any): any;
}

declare module "procreate-swatches" {
  export function readSwatchesFile(data: any): Promise<any>;
}

declare module "color-namer" {
  interface Names {
    ntc: Array<{ name: string }>;
  }

  interface Options {
    pick: string[];
  }

  export default function namer(hex: string, options?: Options): any;
}
