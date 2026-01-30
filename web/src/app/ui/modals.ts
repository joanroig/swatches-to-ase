export const setModalOpen = (modal: HTMLDivElement | null, open: boolean) => {
  if (!modal) {
    return;
  }
  modal.classList.toggle("is-hidden", !open);
  modal.setAttribute("aria-hidden", open ? "false" : "true");
  if (open) {
    const target =
      modal.querySelector<HTMLElement>("[data-autofocus]") ??
      modal.querySelector<HTMLElement>("button, input, select, textarea");
    target?.focus();
  }
};

export const setupModal = (modal: HTMLDivElement | null) => {
  modal?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target?.dataset?.close === "true") {
      setModalOpen(modal, false);
    }
  });
};

export const closeOpenModals = (modals: Array<HTMLDivElement | null>) => {
  modals.forEach((modal) => {
    if (modal && !modal.classList.contains("is-hidden")) {
      setModalOpen(modal, false);
    }
  });
};
