import { topbar } from "../dom";

const SCROLL_THRESHOLD = 4;

export const setupTopbarShadow = () => {
  if (!topbar) {
    return;
  }

  const updateShadow = () => {
    const shouldShow = window.scrollY > SCROLL_THRESHOLD;
    topbar.classList.toggle("is-scrolled", shouldShow);
  };

  updateShadow();
  window.addEventListener("scroll", updateShadow, { passive: true });
};
