import { updateProfile } from "firebase/auth";

import type { AvatarColors } from "../types";
import {
  cloudProfileAvatar,
  cloudProfileAvatarBackgroundInput,
  cloudProfileAvatarForegroundInput,
  cloudProfileNameInput,
  cloudProfileSaveButton,
} from "../dom";
import { cloudState } from "../state";
import { t } from "../i18n";
import { showToast } from "../ui/notifications";
import { areAvatarColorsEqual, DEFAULT_AVATAR_COLORS, getCloudAvatarSrc, normalizeAvatarColors } from "./avatars";
import { firebaseClient } from "./context";
import { upsertPublicProfile } from "./follow";
import { saveUserAvatar } from "./profile-store";
import { renderCloudUserCard } from "./user-card";
import { isCloudUserVerified, requireVerifiedCloudUser } from "./verification";

let pendingAvatar: AvatarColors | null = null;

const readAvatarInputs = (): AvatarColors | null => {
  if (!cloudProfileAvatarBackgroundInput || !cloudProfileAvatarForegroundInput) {
    return null;
  }
  return normalizeAvatarColors({
    background: cloudProfileAvatarBackgroundInput.value,
    foreground: cloudProfileAvatarForegroundInput.value,
  });
};

const setProfileDisabled = (disabled: boolean) => {
  if (cloudProfileNameInput) {
    cloudProfileNameInput.disabled = disabled;
  }
  if (cloudProfileAvatarBackgroundInput) {
    cloudProfileAvatarBackgroundInput.disabled = disabled;
  }
  if (cloudProfileAvatarForegroundInput) {
    cloudProfileAvatarForegroundInput.disabled = disabled;
  }
  if (cloudProfileSaveButton) {
    cloudProfileSaveButton.disabled = disabled;
  }
};

export const syncCloudProfileForm = () => {
  if (
    !cloudProfileAvatar ||
    !cloudProfileNameInput ||
    !cloudProfileAvatarBackgroundInput ||
    !cloudProfileAvatarForegroundInput ||
    !cloudProfileSaveButton
  ) {
    return;
  }

  const user = cloudState.user;
  if (!user) {
    pendingAvatar = null;
    cloudProfileAvatar.src = getCloudAvatarSrc(null);
    cloudProfileAvatar.alt = t("cloud.profile.defaultAlt");
    cloudProfileNameInput.value = "";
    cloudProfileNameInput.placeholder = t("cloud.profile.signInPlaceholder");
    cloudProfileAvatarBackgroundInput.value = DEFAULT_AVATAR_COLORS.background;
    cloudProfileAvatarForegroundInput.value = DEFAULT_AVATAR_COLORS.foreground;
    setProfileDisabled(true);
    return;
  }

  cloudProfileNameInput.value = user.name ?? "";
  cloudProfileNameInput.placeholder = isCloudUserVerified()
    ? t("cloud.profile.name.placeholder")
    : t("cloud.profile.verifyPlaceholder");
  const currentAvatar = normalizeAvatarColors(pendingAvatar ?? user.avatar ?? DEFAULT_AVATAR_COLORS);
  cloudProfileAvatar.src = getCloudAvatarSrc(currentAvatar);
  cloudProfileAvatar.alt = user.name ?? t("cloud.profile.cloudAlt");
  cloudProfileAvatarBackgroundInput.value = currentAvatar.background;
  cloudProfileAvatarForegroundInput.value = currentAvatar.foreground;
  setProfileDisabled(!isCloudUserVerified());
};

export const resetCloudProfileDraft = () => {
  pendingAvatar = null;
  syncCloudProfileForm();
};

export const setupCloudProfileControls = () => {
  if (!cloudProfileAvatarBackgroundInput || !cloudProfileAvatarForegroundInput || !cloudProfileSaveButton) {
    return;
  }

  const handleAvatarInput = () => {
    const draft = readAvatarInputs();
    if (!draft) {
      return;
    }
    pendingAvatar = draft;
    if (cloudProfileAvatar) {
      cloudProfileAvatar.src = getCloudAvatarSrc(draft);
    }
  };

  cloudProfileAvatarBackgroundInput.addEventListener("input", handleAvatarInput);
  cloudProfileAvatarForegroundInput.addEventListener("input", handleAvatarInput);

  cloudProfileSaveButton.addEventListener("click", async () => {
    if (!firebaseClient) {
      showToast(t("toast.firebaseMissing"), "error");
      return;
    }
    const currentUser = firebaseClient.auth.currentUser;
    if (!currentUser || !cloudState.user) {
      showToast(t("toast.profileSignInToUpdate"), "info");
      return;
    }
    if (!requireVerifiedCloudUser()) {
      return;
    }
    if (!cloudProfileNameInput) {
      return;
    }
    const name = cloudProfileNameInput.value.trim();
    if (!name) {
      showToast(t("toast.profileAddName"), "error");
      return;
    }
    const nextAvatar = readAvatarInputs() ?? normalizeAvatarColors(cloudState.user.avatar ?? DEFAULT_AVATAR_COLORS);
    const nameChanged = name !== cloudState.user.name;
    const avatarChanged = !areAvatarColorsEqual(nextAvatar, cloudState.user.avatar ?? null);

    if (!nameChanged && !avatarChanged) {
      showToast(t("toast.profileNoChanges"), "info");
      return;
    }

    cloudProfileSaveButton.disabled = true;
    try {
      const tasks: Array<Promise<void>> = [];
      if (nameChanged) {
        tasks.push(updateProfile(currentUser, { displayName: name }));
      }
      if (avatarChanged) {
        tasks.push(saveUserAvatar(currentUser.uid, nextAvatar));
      }
      await Promise.all(tasks);
      void upsertPublicProfile(name, avatarChanged ? nextAvatar : (cloudState.user.avatar ?? nextAvatar));
      cloudState.user = {
        ...cloudState.user,
        name,
        avatar: avatarChanged ? nextAvatar : cloudState.user.avatar ?? nextAvatar,
      };
      pendingAvatar = null;
      renderCloudUserCard();
      syncCloudProfileForm();
      showToast(t("toast.profileUpdated"), "success");
    } catch (error) {
      console.error(error);
      showToast(t("toast.profileUpdateFailed"), "error");
    } finally {
      cloudProfileSaveButton.disabled = !cloudState.user || !isCloudUserVerified();
    }
  });

  syncCloudProfileForm();
};
