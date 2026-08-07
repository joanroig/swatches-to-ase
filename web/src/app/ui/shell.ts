import { fetchUserInteractions, listenToDiscovery, renderDiscovery } from "../cloud/discovery";
import {
  appShell,
  actionDock,
  fabActionButtons,
  fabHub,
  fabMenu,
  fabToggleButton,
  sidebarToggleButton,
  viewSections,
  viewToggleButtons,
} from "../dom";
import { t } from "../i18n";
import { cloudState, discoveryState } from "../state";
import { setButtonContent } from "./icons";
import { showToast } from "./notifications";

type AppView = "library" | "discover";

let currentView: AppView = "library";

let isSidebarCollapsed = false;

const SIDEBAR_STORAGE_KEY = "palette-studio.sidebar";

const readSidebarCollapsed = () => {
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "collapsed" || stored === "true") {
      return true;
    }
    if (stored === "expanded" || stored === "false") {
      return false;
    }
  } catch {
    return null;
  }
  return null;
};

const persistSidebarCollapsed = (collapsed: boolean) => {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Ignore storage errors (private mode, storage disabled, etc.).
  }
};

let actionDockRaf = 0;
let isActionDockFloating = false;

const syncActionDockFloating = () => {
  if (!actionDock) {
    return;
  }
  if (appShell?.dataset.view !== "library") {
    actionDock.classList.remove("is-floating");
    isActionDockFloating = false;
    return;
  }
  const panel = actionDock.closest<HTMLElement>(".panel-palettes");
  if (!panel) {
    actionDock.classList.remove("is-floating");
    isActionDockFloating = false;
    return;
  }
  const rect = actionDock.getBoundingClientRect();
  if (rect.height === 0 || rect.width === 0) {
    actionDock.classList.remove("is-floating");
    isActionDockFloating = false;
    return;
  }
  const panelRect = panel.getBoundingClientRect();
  const offset = Number.parseFloat(getComputedStyle(actionDock).bottom) || 0;
  const shouldFloat = panelRect.bottom - offset > window.innerHeight + 1;
  if (shouldFloat === isActionDockFloating) {
    return;
  }
  isActionDockFloating = shouldFloat;
  actionDock.classList.toggle("is-floating", shouldFloat);
};

const scheduleActionDockSync = () => {
  if (actionDockRaf) {
    return;
  }
  actionDockRaf = window.requestAnimationFrame(() => {
    actionDockRaf = 0;
    syncActionDockFloating();
  });
};

const setFabOpen = (open: boolean) => {
  if (!fabHub || !fabToggleButton) {
    return;
  }
  fabHub.classList.toggle("is-open", open);
  fabToggleButton.setAttribute("aria-expanded", open ? "true" : "false");
  if (fabMenu) {
    fabMenu.setAttribute("aria-hidden", open ? "false" : "true");
  }
};

const closeFab = () => {
  setFabOpen(false);
};

const toggleFab = () => {
  const next = !(fabHub?.classList.contains("is-open") ?? false);
  setFabOpen(next);
};

const syncViewState = (view: AppView) => {
  currentView = view;
  if (appShell) {
    appShell.dataset.view = view;
  }
  viewSections.forEach((section) => {
    const isActive = section.dataset.viewSection === view;
    section.classList.toggle("is-active", isActive);
    section.setAttribute("aria-hidden", isActive ? "false" : "true");
  });
  viewToggleButtons.forEach((button) => {
    const isActive = button.dataset.viewTarget === view;
    button.classList.toggle("is-active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
  scheduleActionDockSync();
};

const syncSidebarToggleLabel = () => {
  if (!sidebarToggleButton) {
    return;
  }
  setButtonContent(sidebarToggleButton, "chevronDown", t(isSidebarCollapsed ? "nav.expand" : "nav.collapse"));
  sidebarToggleButton.setAttribute("aria-pressed", isSidebarCollapsed ? "true" : "false");
};

const setSidebarCollapsed = (collapsed: boolean) => {
  isSidebarCollapsed = collapsed;
  if (appShell) {
    appShell.dataset.sidebar = collapsed ? "collapsed" : "expanded";
  }
  syncSidebarToggleLabel();
  persistSidebarCollapsed(collapsed);
};

const ensureDiscoverReady = () => {
  if (!cloudState.isConfigured) {
    showToast(t("toast.firebaseDiscoveryMissing"), "info");
    return false;
  }
  if (discoveryState.palettes.length === 0) {
    discoveryState.loading = true;
    renderDiscovery();
  }
  // `fetchUserInteractions` swallows its own errors, but never let a rejection here stop Discover
  // from starting to listen.
  void fetchUserInteractions()
    .catch((): void => {})
    .then(() => {
      listenToDiscovery();
      renderDiscovery();
    });
  return true;
};

export const setActiveView = (view: AppView) => {
  if (view === currentView) {
    return;
  }
  if (view === "discover" && !ensureDiscoverReady()) {
    return;
  }
  syncViewState(view);
  closeFab();
};

export const setupShell = () => {
  viewToggleButtons.forEach((button) => {
    const target = button.dataset.viewTarget === "discover" ? "discover" : "library";
    button.addEventListener("click", () => setActiveView(target));
  });

  fabToggleButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFab();
  });

  fabActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      closeFab();
    });
  });

  document.addEventListener("click", (event) => {
    if (!fabHub || !fabHub.classList.contains("is-open")) {
      return;
    }
    if (event.target instanceof Node && fabHub.contains(event.target)) {
      return;
    }
    closeFab();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFab();
    }
  });

  sidebarToggleButton?.addEventListener("click", () => {
    setSidebarCollapsed(!isSidebarCollapsed);
  });

  window.addEventListener("scroll", scheduleActionDockSync, { passive: true });
  window.addEventListener("resize", scheduleActionDockSync);
  window.addEventListener("actiondock:sync", scheduleActionDockSync);

  const initialView = appShell?.dataset.view === "discover" ? "discover" : "library";
  if (initialView === "discover" && !ensureDiscoverReady()) {
    syncViewState("library");
  } else {
    syncViewState(initialView);
  }
  const storedSidebar = readSidebarCollapsed();
  const initialSidebar =
    typeof storedSidebar === "boolean" ? storedSidebar : appShell?.dataset.sidebar === "collapsed";
  setSidebarCollapsed(initialSidebar);
  if (appShell) {
    window.requestAnimationFrame(() => {
      appShell.dataset.sidebarReady = "true";
    });
  }
  setFabOpen(false);
  scheduleActionDockSync();
};
