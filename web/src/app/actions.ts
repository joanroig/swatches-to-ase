import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { firebaseClient } from "./cloud/context";
import { deleteCloudAccount } from "./cloud/delete";
import {
  fetchUserInteractions,
  listenToDiscovery,
  renderDiscovery,
  savePublicPalette,
  setDiscoverySearch,
  setDiscoverySort,
  toggleLikePublicPalette,
} from "./cloud/discovery";
import { resetCloudProfileDraft, setupCloudProfileControls } from "./cloud/profile";
import {
  getRecaptchaToken,
  hasRecaptchaLoadFailed,
  isRecaptchaEnabled,
  resetRecaptcha,
  setupRecaptcha,
} from "./cloud/recaptcha";
import { unpublishPalette } from "./cloud/public";
import { refreshCloudControls, refreshCloudUser, syncToCloud } from "./cloud/sync";
import {
  addBwToggle,
  addColorButton,
  aboutModal,
  cloudModal,
  cloudAuthSection,
  cloudAuthSwitchButton,
  cloudChangeEmailButton,
  cloudDeleteAccountButton,
  cloudEmailInput,
  cloudEmailSignInButton,
  cloudEmailSignUpButton,
  cloudPasswordInput,
  cloudPasswordResetButton,
  cloudRecaptcha,
  cloudSignInButton,
  cloudSignOutButton,
  cloudSyncButton,
  cloudVerifyEmailButton,
  colorNotationEditorSelect,
  colorNotationSelect,
  confirmGenerateButton,
  discoverModal,
  discoverProfileModal,
  discoverSearchInput,
  discoverSortSelect,
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
  removeAllButton,
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
import { createGeneratedPalette, syncBaseColorState } from "./generation";
import { onLanguageChange, t } from "./i18n";
import { ensureLicenseLoaded, ensureLicensesLoaded } from "./licenses";
import { nameColor, resolveNameFormat } from "./palette/naming";
import {
  cancelEditorChanges,
  confirmEditorClose,
  getPaletteById,
  openEditorForPalette,
  openViewForPalette,
  renderViewModal,
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
import { cloudState, discoveryState, state, viewState } from "./state";
import { hydrateExportActionIcons, setButtonContent } from "./ui/icons";
import { closeOpenModals, setModalOpen, setupModal } from "./ui/modals";
import { appendLog, showToast } from "./ui/notifications";
import { rgbToHex } from "./utils/color";
import { createId } from "./utils/id";

export const applyActionLabels = () => {
  document.querySelectorAll<HTMLButtonElement>('button[data-close="true"][data-i18n="common.close"]').forEach((button) => {
    setButtonContent(button, "x", t("common.close"), true);
    button.classList.add("close-button");
  });
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

  type CloudAuthMode = "signin" | "signup";
  let currentCloudAuthMode: CloudAuthMode = "signin";

  const setCloudAuthMode = (mode: CloudAuthMode) => {
    currentCloudAuthMode = mode;
    if (cloudAuthSection) {
      cloudAuthSection.dataset.mode = mode;
    }
    if (cloudAuthSwitchButton) {
      cloudAuthSwitchButton.textContent = t(mode === "signin" ? "cloud.auth.switch.signup" : "cloud.auth.switch.signin");
    }
    if (cloudPasswordInput) {
      cloudPasswordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
    }
  };

  const activateRecaptchaOnInput = () => {
    const hasValue = Boolean(cloudEmailInput?.value.trim() || cloudPasswordInput?.value.trim());
    if (!hasValue) {
      return;
    }
    void setupRecaptcha(cloudRecaptcha);
  };

  openDiscoverButton?.addEventListener("click", () => {
    if (!cloudState.isConfigured) {
      showToast(t("toast.firebaseDiscoveryMissing"), "info");
      return;
    }
    if (discoveryState.palettes.length === 0) {
      discoveryState.loading = true;
      renderDiscovery();
    }
    void fetchUserInteractions().then(() => {
      listenToDiscovery();
      renderDiscovery();
    });
    setModalOpen(discoverModal, true);
    if (discoverSearchInput) {
      discoverSearchInput.value = discoveryState.search;
    }
  });

  openCloudButton?.addEventListener("click", () => {
    resetCloudProfileDraft();
    refreshCloudControls();
    void refreshCloudUser();
    if (!cloudState.user) {
      setCloudAuthMode("signin");
    }
    setModalOpen(cloudModal, true);
    if (cloudRecaptcha) {
      cloudRecaptcha.classList.add("is-hidden");
    }
    resetRecaptcha();
  });

  cloudAuthSwitchButton?.addEventListener("click", () => {
    const nextMode: CloudAuthMode = currentCloudAuthMode === "signin" ? "signup" : "signin";
    setCloudAuthMode(nextMode);
    cloudEmailInput?.focus();
  });

  cloudEmailInput?.addEventListener("input", activateRecaptchaOnInput);
  cloudPasswordInput?.addEventListener("input", activateRecaptchaOnInput);
  setCloudAuthMode("signin");

  onLanguageChange(() => {
    setCloudAuthMode(currentCloudAuthMode);
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

  viewSaveEditButton?.addEventListener("click", () => {
    if (viewState.mode === "discover") {
      const publicPalette = discoveryState.palettes.find((palette) => palette.id === viewState.publicPaletteId);
      if (!publicPalette) {
        return;
      }
      if (cloudState.user && publicPalette.ownerId === cloudState.user.uid) {
        return;
      }
      void savePublicPalette(publicPalette).then((copy) => {
        if (!copy) {
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
    if (viewState.mode !== "discover") {
      return;
    }
    const publicPalette = discoveryState.palettes.find((palette) => palette.id === viewState.publicPaletteId);
    if (!publicPalette) {
      return;
    }
    if (cloudState.user && publicPalette.ownerId === cloudState.user.uid) {
      return;
    }
    void toggleLikePublicPalette(publicPalette).then(() => {
      renderViewModal();
    });
  });

  viewSaveButton?.addEventListener("click", () => {
    if (viewState.mode !== "discover") {
      return;
    }
    const publicPalette = discoveryState.palettes.find((palette) => palette.id === viewState.publicPaletteId);
    if (!publicPalette) {
      return;
    }
    if (cloudState.user && publicPalette.ownerId === cloudState.user.uid) {
      return;
    }
    void savePublicPalette(publicPalette).then(() => {
      renderViewModal();
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

  const resolveEmailOnly = () => {
    const email = cloudEmailInput?.value.trim() ?? "";
    if (!email) {
      showToast(t("toast.emailMissing"), "info");
      return null;
    }
    return email;
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
      const credential = await createUserWithEmailAndPassword(firebaseClient.auth, payload.email, payload.password);
      if (cloudPasswordInput) {
        cloudPasswordInput.value = "";
      }
      try {
        await sendEmailVerification(credential.user);
        showToast(t("toast.verifyEmailSent"), "success");
      } catch (error) {
        console.error(error);
        showToast(t("toast.verifyEmailFailed"), "error");
      }
    } catch (error) {
      console.error(error);
      showToast(t("toast.signUpFailed"), "error");
    } finally {
      resetRecaptcha();
    }
  });

  cloudPasswordResetButton?.addEventListener("click", async () => {
    if (!firebaseClient) {
      showToast(t("toast.firebaseMissing"), "error");
      return;
    }
    const email = resolveEmailOnly();
    if (!email) {
      return;
    }
    try {
      await sendPasswordResetEmail(firebaseClient.auth, email);
      showToast(t("toast.passwordResetSent"), "success");
    } catch (error) {
      console.error(error);
      showToast(t("toast.passwordResetFailed"), "error");
    }
  });

  cloudVerifyEmailButton?.addEventListener("click", async () => {
    if (!firebaseClient) {
      showToast(t("toast.firebaseMissing"), "error");
      return;
    }
    const currentUser = firebaseClient.auth.currentUser;
    if (!currentUser) {
      showToast(t("toast.verifyEmailSignIn"), "info");
      return;
    }
    if (currentUser.emailVerified) {
      showToast(t("toast.verifyEmailAlready"), "info");
      return;
    }
    try {
      await sendEmailVerification(currentUser);
      showToast(t("toast.verifyEmailSent"), "success");
    } catch (error) {
      console.error(error);
      showToast(t("toast.verifyEmailFailed"), "error");
    }
  });

  const handleCloudSignOut = async (options: { prefillEmail?: string; nextAuthMode?: CloudAuthMode } = {}) => {
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
      if (cloudEmailInput && options.prefillEmail) {
        cloudEmailInput.value = options.prefillEmail;
      }
      if (cloudPasswordInput) {
        cloudPasswordInput.value = "";
      }
      if (options.nextAuthMode) {
        setCloudAuthMode(options.nextAuthMode);
      }
      if (cloudRecaptcha) {
        cloudRecaptcha.classList.add("is-hidden");
      }
      resetRecaptcha();
    } catch (error) {
      console.error(error);
      showToast(t("toast.signOutFailed"), "error");
    }
  };

  cloudSignOutButton?.addEventListener("click", async () => {
    await handleCloudSignOut();
  });

  cloudDeleteAccountButton?.addEventListener("click", async () => {
    if (!firebaseClient) {
      showToast(t("toast.firebaseMissing"), "error");
      return;
    }
    if (!firebaseClient.auth.currentUser) {
      showToast(t("toast.deleteAccountFailed"), "error");
      return;
    }
    const confirmed = window.confirm(t("cloud.deleteAccountConfirm"));
    if (!confirmed) {
      return;
    }
    const runDelete = async () => {
      const result = await deleteCloudAccount();
      if (result === "success") {
        showToast(t("toast.deleteAccountSuccess"), "success");
        return true;
      }
      if (result === "reauth") {
        return false;
      }
      showToast(t("toast.deleteAccountFailed"), "error");
      return null;
    };

    const initial = await runDelete();
    if (initial !== false) {
      return;
    }

    const user = firebaseClient.auth.currentUser;
    if (!user) {
      showToast(t("toast.deleteAccountFailed"), "error");
      return;
    }

    const providers = new Set(user.providerData.map((provider) => provider.providerId));
    const tryReauth = async () => {
      if (providers.has("google.com")) {
        try {
          await reauthenticateWithPopup(user, firebaseClient.provider);
          return true;
        } catch (error) {
          console.warn("[cloud] Re-auth with Google failed.", error);
          return false;
        }
      }
      if (providers.has("password")) {
        const email = user.email ?? cloudEmailInput?.value.trim() ?? "";
        if (!email) {
          return false;
        }
        const password = window.prompt(t("cloud.deleteAccountPasswordPrompt"));
        if (!password) {
          return false;
        }
        try {
          await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, password));
          return true;
        } catch (error) {
          console.warn("[cloud] Re-auth with password failed.", error);
          return false;
        }
      }
      return false;
    };

    const reauthed = await tryReauth();
    if (!reauthed) {
      showToast(t("toast.deleteAccountReauth"), "info");
      return;
    }

    const retry = await runDelete();
    if (retry === false) {
      showToast(t("toast.deleteAccountFailed"), "error");
    }
  });

  cloudChangeEmailButton?.addEventListener("click", async () => {
    const email = cloudState.user?.email ?? cloudEmailInput?.value.trim() ?? "";
    await handleCloudSignOut({ prefillEmail: email, nextAuthMode: "signup" });
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
  setupModal(discoverProfileModal);
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
