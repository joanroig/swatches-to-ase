export {};

declare global {
  interface Window {
    desktopApi?: {
      saveZip: (options: {
        fileName: string;
        data: Uint8Array;
      }) => Promise<{ saved: boolean; path?: string }>;
    };
  }
}
