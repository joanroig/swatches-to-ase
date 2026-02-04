export {};

declare global {
  const __APP_VERSION__: string;
  const __DEPLOY_TIME__: string;

  interface Window {
    desktopApi?: {
      saveZip: (options: { fileName: string; data: Uint8Array }) => Promise<{ saved: boolean; path?: string }>;
      onOpenLegal?: (handler: () => void) => void;
    };
    grecaptcha?: {
      enterprise: {
        ready: (callback: () => void) => void;
        render: (
          container: HTMLElement | string,
          params: {
            sitekey: string;
            action?: string;
            callback?: (token: string) => void;
            "expired-callback"?: () => void;
            "error-callback"?: () => void;
          },
        ) => number;
        getResponse: (widgetId?: number) => string;
        reset: (widgetId?: number) => void;
      };
    };
  }
}
