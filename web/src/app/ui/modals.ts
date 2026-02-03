export const setModalOpen = (modal: HTMLDivElement | null, open: boolean) => {
  if (!modal) {
    return;
  }
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
};

type ModalSetupOptions = {
  onBeforeClose?: () => boolean;
};

export const setupModal = (modal: HTMLDivElement | null, options: ModalSetupOptions = {}) => {
  modal?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target?.dataset?.close === "true") {
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
