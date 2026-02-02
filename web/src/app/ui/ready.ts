import { loadingScreen } from "../dom";

export const waitForAppReady = async () => {
  if (document.readyState !== "complete") {
    await new Promise<void>((resolve) => {
      window.addEventListener("load", () => resolve(), { once: true });
    });
  }
  if ("fonts" in document) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font load errors
    }
  }
  requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
    loadingScreen?.setAttribute("aria-hidden", "true");
    loadingScreen?.setAttribute("aria-busy", "false");
  });
};
