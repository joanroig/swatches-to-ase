let lockedScrollY = 0;
let isBodyScrollLocked = false;

const setBodyScrollLocked = (locked: boolean) => {
  if (locked) {
    if (isBodyScrollLocked) {
      return;
    }
    lockedScrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflowY = "scroll";
    document.body.style.top = `-${lockedScrollY}px`;
    isBodyScrollLocked = true;
    return;
  }

  if (!isBodyScrollLocked) {
    return;
  }
  document.body.style.position = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  document.body.style.overflowY = "";
  document.body.style.top = "";
  isBodyScrollLocked = false;
  window.scrollTo(0, lockedScrollY);
};

const syncBodyScrollLock = () => {
  const hasOpenModal = Boolean(document.querySelector('.modal[aria-hidden="false"]'));
  setBodyScrollLocked(hasOpenModal);
};

export const setModalOpen = (modal: HTMLDivElement | null, open: boolean) => {
  if (!modal) {
    return;
  }
  modal.toggleAttribute("inert", !open);
  if (open) {
    modal.setAttribute("aria-hidden", "false");
    modal.classList.remove("is-open");
    requestAnimationFrame(() => {
      if (modal.getAttribute("aria-hidden") === "false") {
        modal.classList.add("is-open");
      }
    });
    const target =
      modal.querySelector<HTMLElement>("[data-autofocus]") ?? modal.querySelector<HTMLElement>("button, input, select, textarea");
    target?.focus();
  } else {
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("is-open");
  }
  syncBodyScrollLock();
};

type ModalSetupOptions = {
  onBeforeClose?: () => boolean;
};

export const setupModal = (modal: HTMLDivElement | null, options: ModalSetupOptions = {}) => {
  modal?.toggleAttribute("inert", modal.getAttribute("aria-hidden") !== "false");
  modal?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const closeTarget = target?.closest?.<HTMLElement>('[data-close="true"]');
    if (closeTarget) {
      if (options.onBeforeClose && !options.onBeforeClose()) {
        return;
      }
      setModalOpen(modal, false);
    }
  });
};

export const closeOpenModals = (modals: Array<HTMLDivElement | null>) => {
  modals.forEach((modal) => {
    if (modal && modal.getAttribute("aria-hidden") !== "true") {
      setModalOpen(modal, false);
    }
  });
};
