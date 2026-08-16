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

/*
 * Run when a modal closes, however it closed.
 *
 * Registered against the element rather than passed to `setupModal`, because that only sees clicks
 * on a `[data-close]` control — Escape and the stack dismissal go straight to `setModalOpen`, and a
 * dialog whose dismissal means something must hear about all three.
 */
const closeHandlers = new WeakMap<HTMLDivElement, () => void>();

export const onModalClosed = (modal: HTMLDivElement | null, handler: () => void) => {
  if (modal) {
    closeHandlers.set(modal, handler);
  }
};

/*
 * Modals stack in the order they were opened.
 *
 * They used to be ranked by a z-index written per dialog, which only holds while one opening order
 * is possible — and there are two. From Discover you open a creator's profile and then a palette
 * from it, so the palette belongs on top. From a shared link the palette is already open and
 * pressing the sender opens their profile, which then belongs on top. Ranked, one of those always
 * came up behind the other, and behind meant unreachable: the dialog underneath still covers the
 * screen, so every click lands on it.
 *
 * Each one takes a place above whatever is already open, and gives it back when it closes, so the
 * numbers stay within a step or two of the base rather than climbing into the toasts above them.
 */
const MODAL_BASE_Z = 10;

const openModals = () => [...document.querySelectorAll<HTMLDivElement>('.modal[aria-hidden="false"]')];

const topOfStack = () =>
  openModals().reduce((top, modal) => Math.max(top, Number.parseInt(modal.style.zIndex, 10) || MODAL_BASE_Z), MODAL_BASE_Z);

/** The dialog a dismissal should act on: the one actually in front of you. */
export const topmostOpenModal = (modals: Array<HTMLDivElement | null>) => {
  const candidates = modals.filter((modal): modal is HTMLDivElement => !!modal && modal.getAttribute("aria-hidden") === "false");
  return candidates.reduce<HTMLDivElement | null>(
    (top, modal) =>
      !top || (Number.parseInt(modal.style.zIndex, 10) || MODAL_BASE_Z) >= (Number.parseInt(top.style.zIndex, 10) || MODAL_BASE_Z)
        ? modal
        : top,
    null,
  );
};

export const setModalOpen = (modal: HTMLDivElement | null, open: boolean) => {
  if (!modal) {
    return;
  }
  modal.toggleAttribute("inert", !open);
  if (open) {
    modal.style.zIndex = String(topOfStack() + 1);
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
    const wasOpen = modal.getAttribute("aria-hidden") === "false";
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("is-open");
    // Its place in the stack goes back, so the next one to open does not have to climb past it.
    modal.style.zIndex = "";
    if (wasOpen) {
      closeHandlers.get(modal)?.();
    }
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
