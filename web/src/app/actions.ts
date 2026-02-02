import {
  addBwToggle,
  addColorButton,
  autoRenameToggle,
  cloudSignInButton,
  cloudSignOutButton,
  cloudSyncButton,
  colorNotationEditorSelect,
  colorNotationSelect,
  confirmGenerateButton,
  discoverModal,
  editorExportButton,
  editorModal,
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
  openDiscoverButton,
  openExportButton,
  openGenerateButton,
  openImportButton,
  openSettingsButton,
  openViewButton,
  paletteNameInput,
  refreshDiscoverButton,
  removeAllButton,
  settingsModal,
  themeSelect,
  viewEditButton,
  viewModal,
} from "./dom";
import { setButtonContent, hydrateExportActionIcons } from "./ui/icons";
import { appendLog, showToast } from "./ui/notifications";
import { closeOpenModals, setModalOpen, setupModal } from "./ui/modals";
import { cloudState, state, viewState } from "./state";
import { createId } from "./utils/id";
import { createGeneratedPalette, syncBaseColorState } from "./generation";
import {
  getPaletteById,
  openEditorForPalette,
  openViewForPalette,
  syncActivePalette,
  updatePalette,
  updatePaletteName,
} from "./palette/ui";
import {
  exportPalettesSmart,
  getExportTargets,
  handleExportAction,
  setExportMode,
  setSelectedExportFormat,
} from "./export/manager";
import {
  applyColorNotation,
  applyTheme,
  syncNameFormat,
} from "./preferences";
import { persistPreferences } from "./persistence";
import {
  fetchUserInteractions,
  listenToDiscovery,
  renderDiscovery,
} from "./cloud/discovery";
import { syncToCloud } from "./cloud/sync";
import { signInWithPopup, signOut } from "firebase/auth";
import { firebaseClient } from "./cloud/context";

export const setupActions = () => {
  setButtonContent(openDiscoverButton, "globe", "Discover");
  setButtonContent(openSettingsButton, "settings", "Settings");
  setButtonContent(openImportButton, "import", "Import");
  setButtonContent(openGenerateButton, "generate", "Generate");
  setButtonContent(removeAllButton, "trash", "Remove all");
  setButtonContent(openExportButton, "export", "Batch export");
  setButtonContent(openViewButton, "view", "View");
  setButtonContent(editorExportButton, "export", "Export");
  setButtonContent(addColorButton, "plus", "Add color");
  setButtonContent(exportAllButton, "download", "Download");
  setButtonContent(confirmGenerateButton, "generate", "Create palette");
  setButtonContent(generateEmptyButton, "plus", "Create empty palette");
  setButtonContent(viewEditButton, "edit", "Edit");
  setButtonContent(refreshDiscoverButton, "refresh", "Refresh");
  setButtonContent(cloudSignInButton, "login", "Sign in with Google");
  setButtonContent(cloudSignOutButton, "logout", "Sign out");
  setButtonContent(cloudSyncButton, "cloud", "Sync now");
  hydrateExportActionIcons(exportActionIcons);

  openDiscoverButton?.addEventListener("click", () => {
    if (!cloudState.isConfigured) {
      showToast("Firebase is not configured for discovery yet.", "info");
      return;
    }
    void fetchUserInteractions().then(() => {
      listenToDiscovery();
      renderDiscovery();
    });
    setModalOpen(discoverModal, true);
  });

  openSettingsButton?.addEventListener("click", () => {
    setModalOpen(settingsModal, true);
  });

  openImportButton?.addEventListener("click", () => {
    setModalOpen(importModal, true);
  });

  openGenerateButton?.addEventListener("click", () => {
    syncBaseColorState();
    setModalOpen(generateModal, true);
  });

  removeAllButton?.addEventListener("click", () => {
    if (state.palettes.length === 0) {
      return;
    }
    const confirmed = window.confirm(
      "Remove all palettes? This cannot be undone."
    );
    if (!confirmed) {
      return;
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

  openViewButton?.addEventListener("click", () => {
    if (!state.activePaletteId) {
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
      item.colors.push({
        id: createId(),
        name: `Color ${item.colors.length + 1}`,
        rgb: [0.5, 0.5, 0.5],
      });
    });
  });

  paletteNameInput?.addEventListener("input", () => {
    const paletteId =
      paletteNameInput.dataset.paletteId ?? state.activePaletteId;
    if (!paletteId) {
      return;
    }
    const nextName = paletteNameInput.value.trim() || "Untitled Palette";
    updatePaletteName(paletteId, nextName);
  });

  paletteNameInput?.addEventListener("blur", () => {
    if (!paletteNameInput.value.trim()) {
      const paletteId =
        paletteNameInput.dataset.paletteId ?? state.activePaletteId;
      if (!paletteId) {
        return;
      }
      const fallbackName = "Untitled Palette";
      paletteNameInput.value = fallbackName;
      updatePaletteName(paletteId, fallbackName);
    }
  });

  confirmGenerateButton?.addEventListener("click", () => {
    const palette = createGeneratedPalette(false);
    state.palettes.unshift(palette);
    syncActivePalette(palette.id);
    appendLog("Generated a new palette.", "success");
    setModalOpen(generateModal, false);
  });

  generateEmptyButton?.addEventListener("click", () => {
    const palette = createGeneratedPalette(true);
    state.palettes.unshift(palette);
    syncActivePalette(palette.id);
    appendLog("Generated an empty palette.", "success");
    setModalOpen(generateModal, false);
  });

  exportAllButton?.addEventListener("click", () => {
    const targets = getExportTargets();
    if (targets.length === 0) {
      appendLog("No palettes to export yet.", "error");
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
      showToast("Firebase is not configured yet.", "error");
      return;
    }
    try {
      await signInWithPopup(firebaseClient.auth, firebaseClient.provider);
    } catch (error) {
      console.error(error);
      showToast("Unable to sign in. Please try again.", "error");
    }
  });

  cloudSignOutButton?.addEventListener("click", async () => {
    if (!firebaseClient) {
      return;
    }
    try {
      await signOut(firebaseClient.auth);
    } catch (error) {
      console.error(error);
      showToast("Unable to sign out.", "error");
    }
  });

  cloudSyncButton?.addEventListener("click", () => {
    void syncToCloud();
  });

  formatSelect?.addEventListener("change", () =>
    syncNameFormat(formatSelect.value)
  );
  generateFormatSelect?.addEventListener("change", () =>
    syncNameFormat(generateFormatSelect.value)
  );
  addBwToggle?.addEventListener("change", persistPreferences);
  exportFormatOptions.forEach((option) =>
    option.addEventListener("change", persistPreferences)
  );
  colorNotationSelect?.addEventListener("change", () =>
    applyColorNotation(colorNotationSelect.value)
  );
  colorNotationEditorSelect?.addEventListener("change", () =>
    applyColorNotation(colorNotationEditorSelect.value)
  );
  autoRenameToggle?.addEventListener("change", persistPreferences);
  themeSelect?.addEventListener("change", () => {
    applyTheme(themeSelect.value);
    persistPreferences();
  });
  generateUseBaseToggle?.addEventListener("change", syncBaseColorState);

  setupModal(importModal);
  setupModal(settingsModal);
  setupModal(generateModal);
  setupModal(editorModal);
  setupModal(exportModal);
  setupModal(viewModal);
  setupModal(discoverModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOpenModals([
        importModal,
        settingsModal,
        generateModal,
        editorModal,
        exportModal,
        viewModal,
        discoverModal,
      ]);
    }
  });
};
