import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { firebaseClient } from "./cloud/context";
import { fetchUserInteractions, listenToDiscovery, renderDiscovery } from "./cloud/discovery";
import { resetCloudProfileDraft, setupCloudProfileControls } from "./cloud/profile";
import {
  getRecaptchaToken,
  hasRecaptchaLoadFailed,
  isRecaptchaEnabled,
  resetRecaptcha,
  setupRecaptcha,
} from "./cloud/recaptcha";
import { unpublishPalette } from "./cloud/public";
import { refreshCloudControls, syncToCloud } from "./cloud/sync";
import {
  addBwToggle,
  addColorButton,
  aboutModal,
  cloudModal,
  cloudEmailInput,
  cloudEmailSignInButton,
  cloudEmailSignUpButton,
  cloudPasswordInput,
  cloudRecaptcha,
  cloudSignInButton,
  cloudSignOutButton,
  cloudSyncButton,
  colorNotationEditorSelect,
  colorNotationSelect,
  confirmGenerateButton,
  discoverModal,
  editorCancelButton,
  editorExportButton,
  editorModal,
  editorRedoButton,
  editorSaveButton,
  editorUndoButton,
  exportActionButtons,
  exportActionIcons,
  exportAllButton,
  exportFormatOptions,
  exportModal,
  formatSelect,
  generateEmptyButton,
  generateFormatSelect,
  generateModal,
  generateUseBaseToggle,
  importModal,
  languageSelect,
  legalModal,
  licenseModal,
  licensesModal,
  motionSelect,
  openCloudButton,
  openDiscoverButton,
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
  openSettingsButton,
  openTermsButton,
  openViewButton,
  paletteNameInput,
  privacyModal,
  refreshDiscoverButton,
  removeAllButton,
  cookiesModal,
  contactModal,
  settingsModal,
  termsModal,
  themeSelect,
  viewEditButton,
  viewModal,
} from "./dom";
import { exportPalettesSmart, getExportTargets, handleExportAction, setExportMode, setSelectedExportFormat } from "./export/manager";
import { createGeneratedPalette, syncBaseColorState } from "./generation";
import { t } from "./i18n";
import { ensureLicenseLoaded, ensureLicensesLoaded } from "./licenses";
import { nameColor, resolveNameFormat } from "./palette/naming";
import {
  cancelEditorChanges,
  confirmEditorClose,
  getPaletteById,
  openEditorForPalette,
  openViewForPalette,
  redoEditorChange,
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
import { cloudState, state, viewState } from "./state";
import { hydrateExportActionIcons, setButtonContent } from "./ui/icons";
import { closeOpenModals, setModalOpen, setupModal } from "./ui/modals";
import { appendLog, showToast } from "./ui/notifications";
import { rgbToHex } from "./utils/color";
import { createId } from "./utils/id";

export const applyActionLabels = () => {
  setButtonContent(openDiscoverButton, "globe", t("action.discover"));
  setButtonContent(openCloudButton, "cloud", t("action.cloud"));
  setButtonContent(openSettingsButton, "settings", t("action.settings"));
  setButtonContent(openImportButton, "import", t("action.import"));
  setButtonContent(openGenerateButton, "generate", t("action.generate"));
  setButtonContent(removeAllButton, "trash", t("action.removeAll"));
  setButtonContent(openExportButton, "export", t("action.exportAll"));
  setButtonContent(openViewButton, "view", t("action.view"));
  setButtonContent(editorExportButton, "export", t("action.export"));
  setButtonContent(editorUndoButton, "undo", t("action.undo"), true);
  setButtonContent(editorRedoButton, "redo", t("action.redo"), true);
  setButtonContent(addColorButton, "plus", t("action.addColor"));
  setButtonContent(exportAllButton, "download", t("action.download"));
  setButtonContent(confirmGenerateButton, "generate", t("action.createPalette"));
  setButtonContent(generateEmptyButton, "plus", t("action.createEmptyPalette"));
  setButtonContent(viewEditButton, "edit", t("action.edit"));
  setButtonContent(refreshDiscoverButton, "refresh", t("action.refresh"));
  setButtonContent(cloudSignInButton, "login", t("action.signInGoogle"));
  setButtonContent(cloudEmailSignInButton, "login", t("action.signInEmail"));
  setButtonContent(cloudEmailSignUpButton, "plus", t("action.signUpEmail"));
  setButtonContent(cloudSignOutButton, "logout", t("action.signOut"));
  setButtonContent(cloudSyncButton, "cloud", t("action.syncNow"));
};

export const setupActions = () => {
  applyActionLabels();
  hydrateExportActionIcons(exportActionIcons);

  const requireRecaptchaToken = () => {
    if (!isRecaptchaEnabled()) {
      return true;
    }
    if (hasRecaptchaLoadFailed()) {
      showToast(t("toast.recaptchaLoadFailed"), "error");
      return false;
    }
    const recaptchaToken = getRecaptchaToken();
    if (recaptchaToken) {
      return true;
    }
    showToast(t("toast.recaptchaRequired"), "info");
    return false;
  };

  openDiscoverButton?.addEventListener("click", () => {
    if (!cloudState.isConfigured) {
      showToast(t("toast.firebaseDiscoveryMissing"), "info");
      return;
    }
    void fetchUserInteractions().then(() => {
      listenToDiscovery();
      renderDiscovery();
    });
    setModalOpen(discoverModal, true);
  });

  openCloudButton?.addEventListener("click", () => {
    resetCloudProfileDraft();
    refreshCloudControls();
    setModalOpen(cloudModal, true);
    void setupRecaptcha(cloudRecaptcha);
    resetRecaptcha();
  });

  openSettingsButton?.addEventListener("click", () => {
    setModalOpen(settingsModal, true);
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
    setModalOpen(generateModal, true);
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

  editorCancelButton?.addEventListener("click", () => {
    cancelEditorChanges();
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
    const palette = createGeneratedPalette(false);
    state.palettes.unshift(palette);
    syncActivePalette(palette.id);
    appendLog(t("log.generated"), "success");
    setModalOpen(generateModal, false);
  });

  generateEmptyButton?.addEventListener("click", () => {
    const palette = createGeneratedPalette(true);
    state.palettes.unshift(palette);
    syncActivePalette(palette.id);
    appendLog(t("log.generatedEmpty"), "success");
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

  viewEditButton?.addEventListener("click", () => {
    if (!viewState.paletteId || !getPaletteById(viewState.paletteId)) {
      return;
    }
    setModalOpen(viewModal, false);
    openEditorForPalette(viewState.paletteId);
  });

  refreshDiscoverButton?.addEventListener("click", () => {
    void fetchUserInteractions().then(() => {
      listenToDiscovery();
      renderDiscovery();
    });
  });

  cloudSignInButton?.addEventListener("click", async () => {
    if (!firebaseClient) {
      showToast(t("toast.firebaseMissing"), "error");
      return;
    }
    try {
      await signInWithPopup(firebaseClient.auth, firebaseClient.provider);
    } catch (error) {
      console.error(error);
      showToast(t("toast.signInFailed"), "error");
    }
  });

  const resolveEmailAuthPayload = () => {
    const email = cloudEmailInput?.value.trim() ?? "";
    const password = cloudPasswordInput?.value ?? "";
    if (!email || !password) {
      showToast(t("toast.emailAuthMissing"), "info");
      return null;
    }
    return { email, password };
  };

  cloudEmailSignInButton?.addEventListener("click", async () => {
    if (!firebaseClient) {
      showToast(t("toast.firebaseMissing"), "error");
      return;
    }
    const payload = resolveEmailAuthPayload();
    if (!payload) {
      return;
    }
    if (!requireRecaptchaToken()) {
      return;
    }
    try {
      await signInWithEmailAndPassword(firebaseClient.auth, payload.email, payload.password);
      if (cloudPasswordInput) {
        cloudPasswordInput.value = "";
      }
    } catch (error) {
      console.error(error);
      showToast(t("toast.signInFailed"), "error");
    } finally {
      resetRecaptcha();
    }
  });

  cloudEmailSignUpButton?.addEventListener("click", async () => {
    if (!firebaseClient) {
      showToast(t("toast.firebaseMissing"), "error");
      return;
    }
    const payload = resolveEmailAuthPayload();
    if (!payload) {
      return;
    }
    if (!requireRecaptchaToken()) {
      return;
    }
    try {
      await createUserWithEmailAndPassword(firebaseClient.auth, payload.email, payload.password);
      if (cloudPasswordInput) {
        cloudPasswordInput.value = "";
      }
    } catch (error) {
      console.error(error);
      showToast(t("toast.signUpFailed"), "error");
    } finally {
      resetRecaptcha();
    }
  });

  cloudSignOutButton?.addEventListener("click", async () => {
    if (!firebaseClient) {
      return;
    }
    try {
      if (state.palettes.length > 0) {
        const keepLocal = window.confirm(t("cloud.signOutKeepLocalConfirm", { count: state.palettes.length }));
        if (keepLocal) {
          state.palettes.forEach((palette) => {
            palette.isPublic = false;
            palette.publicId = null;
          });
          cloudState.applyingRemote = true;
          syncActivePalette(state.activePaletteId);
          cloudState.applyingRemote = false;
        } else {
          state.palettes = [];
          cloudState.applyingRemote = true;
          syncActivePalette(null);
          cloudState.applyingRemote = false;
        }
      }
      await signOut(firebaseClient.auth);
    } catch (error) {
      console.error(error);
      showToast(t("toast.signOutFailed"), "error");
    }
  });

  cloudSyncButton?.addEventListener("click", () => {
    void syncToCloud("manual");
  });

  formatSelect?.addEventListener("change", () => {
    syncNameFormat(formatSelect.value);
    syncPaletteColorNames(formatSelect.value);
  });
  generateFormatSelect?.addEventListener("change", () => {
    syncNameFormat(generateFormatSelect.value);
    syncPaletteColorNames(generateFormatSelect.value);
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
  generateUseBaseToggle?.addEventListener("change", syncBaseColorState);

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
  setupModal(discoverModal);
  setupEditorLayout();
  setupCloudProfileControls();

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
        discoverModal,
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
