export {};

declare global {
  const __APP_VERSION__: string;

  interface Window {
    desktopApi?: {
      saveZip: (options: {
        fileName: string;
        data: Uint8Array;
      }) => Promise<{ saved: boolean; path?: string }>;
    };
  }
}
