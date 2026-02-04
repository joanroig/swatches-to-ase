import { cookieAcceptButton, cookieBanner, cookieDeclineButton, cookieManageButton, cookiesModal } from "./dom";
import { setModalOpen } from "./ui/modals";

type CookieConsent = "accepted" | "rejected";

const COOKIE_CONSENT_KEY = "palette:cookie-consent";

const readConsent = (): CookieConsent | null => {
  if (typeof localStorage === "undefined") {
    return null;
  }
  const value = localStorage.getItem(COOKIE_CONSENT_KEY);
  return value === "accepted" || value === "rejected" ? value : null;
};

const writeConsent = (value: CookieConsent) => {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(COOKIE_CONSENT_KEY, value);
};

const showBanner = (banner: HTMLDivElement) => {
  banner.hidden = false;
  requestAnimationFrame(() => {
    banner.classList.add("is-visible");
  });
};

const hideBanner = (banner: HTMLDivElement) => {
  banner.classList.remove("is-visible");
  const finish = () => {
    banner.hidden = true;
    banner.removeEventListener("transitionend", finish);
  };
  banner.addEventListener("transitionend", finish);
  setTimeout(finish, 240);
};

export const setupCookieBanner = () => {
  if (!cookieBanner) {
    return;
  }

  const existing = readConsent();
  if (!existing) {
    showBanner(cookieBanner);
  } else {
    cookieBanner.hidden = true;
  }

  cookieAcceptButton?.addEventListener("click", () => {
    writeConsent("accepted");
    hideBanner(cookieBanner);
  });

  cookieDeclineButton?.addEventListener("click", () => {
    writeConsent("rejected");
    hideBanner(cookieBanner);
  });

  cookieManageButton?.addEventListener("click", () => {
    setModalOpen(cookiesModal, true);
  });
};
