import { trackEvent } from "./cloud/analytics";
import { getCloudAuthMode, setCloudAuthMode, type CloudAuthMode } from "./cloud/auth-mode";
import {
  prefetchCloud,
  refreshCloudControls,
  refreshCloudUser,
  renderDiscovery,
  resetCloudProfileDraft,
  savePublicPalette,
  setDiscoverySearch,
  setDiscoverySort,
  toggleLikePublicPalette,
  unpublishPalette,
} from "./cloud/lazy";
import { setupCloudAuthBindings } from "./cloud/auth-bindings";
import { refreshDiscoveryFilters, setupDiscoveryFilters } from "./cloud/discovery-filters";
import { createSelectChip } from "./ui/select-chip";
import {
  addBwToggle,
  addColorButton,
  aboutModal,
  appShell,
  cloudModal,
  cloudAuthSwitchButton,
  cloudEmailInput,
  cloudEmailSignInButton,
  cloudEmailSignUpButton,
  cloudPasswordInput,
  cloudSignInButton,
  cloudSignOutButton,
  cloudSyncButton,
  colorNotationEditorSelect,
  colorNotationSelect,
  confirmGenerateButton,
  createFolderButton,
  generateBaseColorInput,
  generateDestination,
  generateHistoryBackButton,
  generateHistoryForwardButton,
  discoverProfileModal,
  discoverSearchInput,
  discoverSortSelect,
  editorExportButton,
  editorLayoutToggle,
  editorModal,
  editorRedoButton,
  editorSaveButton,
  editorToolbar,
  editorToolbarSpacer,
  editorOverflow,
  editorToolsPrimary,
  editorToolsPanel,
  editorToolsTrigger,
  editorUndoButton,
  exportActionButtons,
  exportActionIcons,
  exportAllButton,
  exportFormatOptions,
  exportModal,
  formatSelect,
  generateFormatSelect,
  generateModal,
  generateNameInput,
  generateCountInput,
  generateStyleSelect,
  generateUseBaseToggle,
  importModal,
  languageSelect,
  librarySearchInput,
  legalModal,
  licenseModal,
  licensesModal,
  motionSelect,
  openExportButton,
  openAboutButton,
  openFooterLicenseButton,
  openGenerateButton,
  openImportButton,
  openLegalButton,
  openLicenseButton,
  openLicensesButton,
  openCookiesButton,
  openContactButton,
  openPrivacyButton,
  openCloudButtons,
  openSettingsButtons,
  openTermsButton,
  openViewButton,
  paletteNameInput,
  privacyModal,
  fabExportButton,
  fabGenerateButton,
  fabImportButton,
  fabToggleButton,
  viewToggleButtons,
  sidebarToggleButton,
  removeAllButton,
  saveGeneratedPaletteButton,
  cookiesModal,
  contactModal,
  settingsModal,
  termsModal,
  themeSelect,
  viewLikeButton,
  viewSaveButton,
  viewSaveEditButton,
  viewModal,
} from "./dom";
import { exportPalettesSmart, getExportTargets, handleExportAction, setExportMode, setSelectedExportFormat } from "./export/manager";
import {
  randomizeGeneratedPalettePreview,
  saveGeneratedPaletteFromPreview,
  showNextGeneratedPalettePreview,
  showPreviousGeneratedPalettePreview,
  startGeneratedPalettePreviewSession,
  syncBaseColorState,
  syncGeneratedPalettePreviewBaseColor,
  syncGeneratedPalettePreviewCount,
  syncGeneratedPalettePreviewFormat,
  syncGeneratedPalettePreviewName,
} from "./generation";
import { onLanguageChange, t } from "./i18n";
import { ensureLicenseLoaded, ensureLicensesLoaded } from "./licenses";
import { createFolder, getOpenFolderName, getTargetFolderId } from "./palette/folders";
import { nameColor, resolveNameFormat } from "./palette/naming";
import {
  confirmEditorClose,
  getPaletteById,
  openEditorForPalette,
  openViewForPalette,
  renderPaletteList,
  renderViewModal,
  redoEditorChange,
  runSharedImport,
  saveEditorChanges,
  setupEditorLayout,
  syncActivePalette,
  syncPaletteColorNames,
  undoEditorChange,
  updatePalette,
  updatePaletteName,
} from "./palette/ui";
import { persistPreferences } from "./persistence";
import { applyColorNotation, applyLanguagePreference, applyMotionPreference, applyTheme, syncNameFormat } from "./preferences";
import { cloudState, discoveryState, libraryState, state, viewState } from "./state";
import { hydrateExportActionIcons, setButtonContent } from "./ui/icons";
import { closeOpenModals, setModalOpen, setupModal } from "./ui/modals";
import { setupPopover } from "./ui/popover";
import { createOverflowRow } from "./ui/overflow-row";
import { appendLog, showToast } from "./ui/notifications";
import { rgbToHex } from "./utils/color";
import { createId } from "./utils/id";

export const applyActionLabels = () => {
  document.querySelectorAll<HTMLButtonElement>('button[data-close="true"][data-i18n="common.close"]').forEach((button) => {
    setButtonContent(button, "x", t("common.close"), true);
    button.classList.add("close-button");
  });
  viewToggleButtons.forEach((button) => {
    const target = button.dataset.viewTarget;
    if (target === "library") {
      // A grid of swatches, not a sheet of paper: the library holds palettes, and the page icon it
      // used to carry read as a document view.
      setButtonContent(button, "library", t("nav.library"));
    } else if (target === "playground") {
      setButtonContent(button, "playground", t("nav.playground"));
    } else if (target === "discover") {
      setButtonContent(button, "globe", t("action.discover"));
    }
  });
  openSettingsButtons.forEach((button) => {
    const isSidebar = button.dataset.context === "sidebar";
    setButtonContent(button, "settings", t("action.settings"), !isSidebar);
  });
  if (sidebarToggleButton) {
    const isCollapsed = appShell?.dataset.sidebar === "collapsed";
    setButtonContent(sidebarToggleButton, "chevronDown", t(isCollapsed ? "nav.expand" : "nav.collapse"));
  }
  setButtonContent(fabToggleButton, "plus", t("fab.actions"), true);
  setButtonContent(fabImportButton, "import", t("action.import"));
  setButtonContent(fabGenerateButton, "generate", t("action.generate"));
  setButtonContent(fabExportButton, "export", t("action.exportAll"));
  setButtonContent(openImportButton, "import", t("action.import"));
  setButtonContent(openGenerateButton, "generate", t("action.generate"));
  setButtonContent(removeAllButton, "trash", t("action.removeAll"));
  // A folder with a plus, not a bare plus: on a narrow toolbar the label goes and the icon is all
  // that is left to say what the button makes.
  setButtonContent(createFolderButton, "folderPlus", t("folder.create"));
  setButtonContent(openExportButton, "export", t("action.exportAll"));
  setButtonContent(openViewButton, "view", t("action.view"));
  setButtonContent(editorExportButton, "export", t("action.export"));
  setButtonContent(editorUndoButton, "undo", t("action.undo"), true);
  setButtonContent(editorRedoButton, "redo", t("action.redo"), true);
  setButtonContent(addColorButton, "plus", t("action.addColor"));
  setButtonContent(exportAllButton, "download", t("action.download"));
  setButtonContent(generateHistoryBackButton, "undo", t("action.back"), true);
  setButtonContent(generateHistoryForwardButton, "redo", t("action.forward"), true);
  setButtonContent(confirmGenerateButton, "generate", t("action.generatePalette"));
  setButtonContent(saveGeneratedPaletteButton, "bookmark", t("action.save"));
  setButtonContent(cloudSignInButton, "login", t("action.signInGoogle"));
  setButtonContent(cloudEmailSignInButton, "login", t("action.signInEmail"));
  setButtonContent(cloudEmailSignUpButton, "plus", t("action.signUpEmail"));
  setButtonContent(cloudSignOutButton, "logout", t("action.signOut"));
  setButtonContent(cloudSyncButton, "cloud", t("action.syncNow"));
  setButtonContent(editorToolsTrigger, "more", t("action.moreActions"), true);
  setButtonContent(editorLayoutToggle, "rows", t("editor.layout.switchToVertical"), true);
};

export const setupActions = () => {
  applyActionLabels();
  hydrateExportActionIcons(exportActionIcons);

  openCloudButtons.forEach((button) => {
    button.addEventListener("click", () => {
      prefetchCloud();
      resetCloudProfileDraft();
      refreshCloudControls();
      void refreshCloudUser();
      if (!cloudState.user) {
        setCloudAuthMode("signin");
      }
      setModalOpen(cloudModal, true);
    });
  });

  cloudAuthSwitchButton?.addEventListener("click", () => {
    const nextMode: CloudAuthMode = getCloudAuthMode() === "signin" ? "signup" : "signin";
    setCloudAuthMode(nextMode);
    cloudEmailInput?.focus();
  });

  setCloudAuthMode("signin");

  let editorOverflowRow: ReturnType<typeof createOverflowRow> | null = null;

  onLanguageChange(() => {
    setCloudAuthMode(getCloudAuthMode());
    syncGeneratedPalettePreviewName();
    // The filter panel is built from script, so nothing else re-translates its twenty-odd rows.
    refreshDiscoveryFilters();
    requestAnimationFrame(() => editorOverflowRow?.refresh(true));
  });

  openSettingsButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setModalOpen(settingsModal, true);
    });
  });

  openLegalButton?.addEventListener("click", () => {
    setModalOpen(legalModal, true);
  });

  openTermsButton?.addEventListener("click", () => {
    setModalOpen(termsModal, true);
  });

  openPrivacyButton?.addEventListener("click", () => {
    setModalOpen(privacyModal, true);
  });

  openCookiesButton?.addEventListener("click", () => {
    setModalOpen(cookiesModal, true);
  });

  openFooterLicenseButton?.addEventListener("click", () => {
    setModalOpen(licenseModal, true);
    void ensureLicenseLoaded();
  });

  openContactButton?.addEventListener("click", () => {
    setModalOpen(contactModal, true);
  });

  openAboutButton?.addEventListener("click", () => {
    setModalOpen(aboutModal, true);
  });

  openLicenseButton?.addEventListener("click", () => {
    setModalOpen(legalModal, false);
    setModalOpen(licenseModal, true);
    void ensureLicenseLoaded();
  });

  openLicensesButton?.addEventListener("click", () => {
    setModalOpen(legalModal, false);
    setModalOpen(licenseModal, false);
    setModalOpen(licensesModal, true);
    void ensureLicensesLoaded();
  });

  openImportButton?.addEventListener("click", () => {
    setModalOpen(importModal, true);
  });

  openGenerateButton?.addEventListener("click", () => {
    syncBaseColorState();
    startGeneratedPalettePreviewSession();
    // Where it lands depends on which folder is open, so the dialog says so rather than leaving it
    // to be discovered after saving.
    if (generateDestination) {
      generateDestination.textContent = t("folder.savesTo", { name: getOpenFolderName() });
    }
    setModalOpen(generateModal, true);
  });

  fabImportButton?.addEventListener("click", () => {
    openImportButton?.click();
  });

  fabGenerateButton?.addEventListener("click", () => {
    openGenerateButton?.click();
  });

  removeAllButton?.addEventListener("click", async () => {
    if (state.palettes.length === 0) {
      return;
    }
    const confirmed = window.confirm(t("palette.removeAllConfirm"));
    if (!confirmed) {
      return;
    }
    const publicPalettes = state.palettes.filter((palette) => palette.isPublic);
    if (publicPalettes.length > 0) {
      const results = await Promise.allSettled(publicPalettes.map((palette) => unpublishPalette(palette, { persist: false })));
      if (results.some((result) => result.status === "rejected")) {
        showToast(t("toast.paletteUnpublishFailed"), "error");
      }
    }
    state.palettes = [];
    syncActivePalette(null);
  });

  openExportButton?.addEventListener("click", () => {
    if (state.palettes.length === 0) {
      return;
    }
    setExportMode("batch");
    setSelectedExportFormat("all");
    setModalOpen(exportModal, true);
  });

  fabExportButton?.addEventListener("click", () => {
    openExportButton?.click();
  });

  editorExportButton?.addEventListener("click", () => {
    if (!state.activePaletteId) {
      return;
    }
    setExportMode("single");
    setModalOpen(exportModal, true);
  });

  editorUndoButton?.addEventListener("click", () => {
    undoEditorChange();
  });

  editorRedoButton?.addEventListener("click", () => {
    redoEditorChange();
  });

  editorSaveButton?.addEventListener("click", () => {
    void saveEditorChanges();
  });

  openViewButton?.addEventListener("click", () => {
    if (!state.activePaletteId) {
      return;
    }
    if (!confirmEditorClose()) {
      return;
    }
    setModalOpen(editorModal, false);
    openViewForPalette(state.activePaletteId);
  });

  addColorButton?.addEventListener("click", () => {
    if (!state.activePaletteId) {
      return;
    }
    updatePalette(state.activePaletteId, (item) => {
      const rgb: [number, number, number] = [0.5, 0.5, 0.5];
      const nameFormat = resolveNameFormat(formatSelect?.value ?? "pantone");
      const name = nameColor(rgbToHex(rgb).toUpperCase(), nameFormat, item.colors.length);
      item.colors.push({
        id: createId(),
        name,
        rgb,
      });
    });
  });

  paletteNameInput?.addEventListener("input", () => {
    const paletteId = paletteNameInput.dataset.paletteId ?? state.activePaletteId;
    if (!paletteId) {
      return;
    }
    const nextName = paletteNameInput.value.trim() || t("palette.untitled");
    updatePaletteName(paletteId, nextName);
  });

  paletteNameInput?.addEventListener("blur", () => {
    if (!paletteNameInput.value.trim()) {
      const paletteId = paletteNameInput.dataset.paletteId ?? state.activePaletteId;
      if (!paletteId) {
        return;
      }
      const fallbackName = t("palette.untitled");
      paletteNameInput.value = fallbackName;
      updatePaletteName(paletteId, fallbackName);
    }
  });

  confirmGenerateButton?.addEventListener("click", () => {
    randomizeGeneratedPalettePreview();
  });

  generateHistoryBackButton?.addEventListener("click", () => {
    showPreviousGeneratedPalettePreview();
  });

  generateHistoryForwardButton?.addEventListener("click", () => {
    showNextGeneratedPalettePreview();
  });

  saveGeneratedPaletteButton?.addEventListener("click", () => {
    const palette = saveGeneratedPaletteFromPreview();
    trackEvent("palette_created", { colors: palette.colors.length, style: generateStyleSelect?.value ?? "unknown" });
    // Into whichever folder the library is showing, which is Drafts at the top level. A new palette
    // used to arrive unfiled wherever you were, so making one from inside a folder put it somewhere
    // other than the folder you were looking at.
    palette.folderId = getTargetFolderId();
    state.palettes.unshift(palette);
    syncActivePalette(palette.id);
    appendLog(t(palette.colors.length === 0 ? "log.generatedEmpty" : "log.generated"), "success");
    setModalOpen(generateModal, false);
  });

  exportAllButton?.addEventListener("click", () => {
    const targets = getExportTargets();
    if (targets.length === 0) {
      appendLog(t("log.noPalettesToExport"), "error");
      return;
    }
    void exportPalettesSmart(targets);
  });

  exportActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      void handleExportAction(button.dataset.exportAction);
    });
  });

  /** The public palette currently shown in the view modal, if it is a Discover one. */
  const getViewedPublicPalette = () =>
    viewState.mode === "discover" ? (discoveryState.palettes.find((palette) => palette.id === viewState.publicPaletteId) ?? null) : null;

  viewSaveEditButton?.addEventListener("click", () => {
    const publicPalette = getViewedPublicPalette();
    if (publicPalette) {
      void savePublicPalette(publicPalette).then(({ copy }) => {
        renderDiscovery();
        if (!copy) {
          renderViewModal();
          return;
        }
        setModalOpen(viewModal, false);
        openEditorForPalette(copy.id);
      });
      return;
    }

    if (!viewState.paletteId || !getPaletteById(viewState.paletteId)) {
      return;
    }
    setModalOpen(viewModal, false);
    openEditorForPalette(viewState.paletteId);
  });

  viewLikeButton?.addEventListener("click", () => {
    const publicPalette = getViewedPublicPalette();
    if (!publicPalette) {
      return;
    }
    void toggleLikePublicPalette(publicPalette).finally(() => {
      renderViewModal();
      renderDiscovery();
    });
  });

  viewSaveButton?.addEventListener("click", () => {
    // In a shared preview this button is the Import action, and there is no public record behind it.
    if (runSharedImport()) {
      return;
    }
    const publicPalette = getViewedPublicPalette();
    if (!publicPalette) {
      return;
    }
    void savePublicPalette(publicPalette).finally(() => {
      renderViewModal();
      renderDiscovery();
    });
  });

  formatSelect?.addEventListener("change", () => {
    syncNameFormat(formatSelect.value);
    syncPaletteColorNames(formatSelect.value);
  });
  generateFormatSelect?.addEventListener("change", () => {
    syncNameFormat(generateFormatSelect.value);
    syncPaletteColorNames(generateFormatSelect.value);
    syncGeneratedPalettePreviewFormat();
  });
  generateStyleSelect?.addEventListener("change", () => {
    persistPreferences();
    randomizeGeneratedPalettePreview();
  });
  generateCountInput?.addEventListener("change", () => {
    syncGeneratedPalettePreviewCount();
  });
  generateBaseColorInput?.addEventListener("input", () => {
    if (!(generateUseBaseToggle?.checked ?? false)) {
      return;
    }
    syncGeneratedPalettePreviewBaseColor();
  });
  generateNameInput?.addEventListener("input", () => {
    syncGeneratedPalettePreviewName();
  });
  addBwToggle?.addEventListener("change", persistPreferences);
  exportFormatOptions.forEach((option) => option.addEventListener("change", persistPreferences));
  colorNotationSelect?.addEventListener("change", () => applyColorNotation(colorNotationSelect.value));
  colorNotationEditorSelect?.addEventListener("change", () => applyColorNotation(colorNotationEditorSelect.value));
  themeSelect?.addEventListener("change", () => {
    applyTheme(themeSelect.value);
    persistPreferences();
  });
  motionSelect?.addEventListener("change", () => applyMotionPreference(motionSelect.value));
  languageSelect?.addEventListener("change", () => applyLanguagePreference(languageSelect.value));
  generateUseBaseToggle?.addEventListener("change", () => {
    syncBaseColorState();
    if (!(generateUseBaseToggle?.checked ?? false)) {
      randomizeGeneratedPalettePreview();
      return;
    }
    syncGeneratedPalettePreviewBaseColor();
  });

  setupDiscoveryFilters();

  if (discoverSortSelect) {
    discoverSortSelect.value = discoveryState.sort;
    discoverSortSelect.addEventListener("change", () => {
      setDiscoverySort(discoverSortSelect.value);
    });
  }

  if (discoverSearchInput) {
    discoverSearchInput.value = discoveryState.search;
    discoverSearchInput.addEventListener("input", () => {
      setDiscoverySearch(discoverSearchInput.value);
    });
  }

  if (librarySearchInput) {
    librarySearchInput.value = libraryState.search;
    librarySearchInput.addEventListener("input", () => {
      libraryState.search = librarySearchInput.value;
      renderPaletteList();
    });
  }

  createFolderButton?.addEventListener("click", () => {
    const folder = createFolder();
    trackEvent("folder_created");
    // A brand new folder is empty, so make sure it is expanded and visible.
    libraryState.collapsedFolderIds.delete(folder.id);
    renderPaletteList();
  });


  setupModal(importModal);
  setupModal(settingsModal);
  setupModal(legalModal);
  setupModal(termsModal);
  setupModal(privacyModal);
  setupModal(cookiesModal);
  setupModal(contactModal);
  setupModal(aboutModal);
  setupModal(licenseModal);
  setupModal(licensesModal);
  setupModal(cloudModal);
  setupModal(generateModal);
  setupModal(editorModal, { onBeforeClose: confirmEditorClose });
  setupModal(exportModal);
  setupModal(viewModal);
  setupModal(discoverProfileModal);
  setupEditorLayout();
  if (editorOverflow && editorToolbar && editorToolbarSpacer && editorToolsPrimary && editorToolsPanel && editorToolsTrigger) {
    const popover = setupPopover({ root: editorOverflow, trigger: editorToolsTrigger, panel: editorToolsPanel });
    editorOverflowRow = createOverflowRow({
      row: editorOverflow,
      primary: editorToolsPrimary,
      menu: editorToolsPanel,
      trigger: editorToolsTrigger,
      resizeTarget: editorToolbar,
      availableWidth: () => editorOverflow.clientWidth + editorToolbarSpacer.clientWidth,
      onCollapse: popover.close,
    });
  }
  createSelectChip(discoverSortSelect);
  setupCloudAuthBindings();

  window.desktopApi?.onOpenLegal?.(() => {
    setModalOpen(legalModal, true);
  });

  const isEditorModalOpen = () => editorModal?.getAttribute("aria-hidden") !== "true";
  const isEditableTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tag = target.tagName.toLowerCase();
    return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
  };

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (isEditorModalOpen() && !confirmEditorClose()) {
        return;
      }
      closeOpenModals([
        importModal,
        settingsModal,
        legalModal,
        termsModal,
        privacyModal,
        cookiesModal,
        contactModal,
        aboutModal,
        licenseModal,
        licensesModal,
        cloudModal,
        generateModal,
        editorModal,
        exportModal,
        viewModal,
        discoverProfileModal,
      ]);
    }

    if (!isEditorModalOpen() || event.defaultPrevented || isEditableTarget(event.target)) {
      return;
    }
    const isModifier = event.ctrlKey || event.metaKey;
    if (!isModifier) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undoEditorChange();
    } else if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      redoEditorChange();
    }
  });
};
