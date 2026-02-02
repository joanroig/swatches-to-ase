import { updateProfile } from "firebase/auth";

import {
  cloudProfileAvatar,
  cloudProfileNameInput,
  cloudProfilePhotoInput,
  cloudProfileSaveButton,
} from "../dom";
import { cloudState } from "../state";
import { showToast } from "../ui/notifications";
import { firebaseClient } from "./context";
import { getCloudAvatarSrc } from "./avatars";
import { renderCloudUserCard } from "./user-card";

let pendingPhotoUrl: string | null = null;

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read image data."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed."));
    reader.readAsDataURL(file);
  });

const setProfileDisabled = (disabled: boolean) => {
  if (cloudProfileNameInput) {
    cloudProfileNameInput.disabled = disabled;
  }
  if (cloudProfilePhotoInput) {
    cloudProfilePhotoInput.disabled = disabled;
  }
  if (cloudProfileSaveButton) {
    cloudProfileSaveButton.disabled = disabled;
  }
};

export const syncCloudProfileForm = () => {
  if (
    !cloudProfileAvatar ||
    !cloudProfileNameInput ||
    !cloudProfilePhotoInput ||
    !cloudProfileSaveButton
  ) {
    return;
  }

  const user = cloudState.user;
  if (!user) {
    pendingPhotoUrl = null;
    cloudProfileAvatar.src = getCloudAvatarSrc(null);
    cloudProfileAvatar.alt = "Default profile placeholder";
    cloudProfileNameInput.value = "";
    cloudProfileNameInput.placeholder = "Sign in to edit your profile";
    cloudProfilePhotoInput.value = "";
    setProfileDisabled(true);
    return;
  }

  cloudProfileNameInput.value = user.name ?? "";
  cloudProfileNameInput.placeholder = "Palette Studio user";
  cloudProfileAvatar.src = pendingPhotoUrl ?? getCloudAvatarSrc(user.photoUrl);
  cloudProfileAvatar.alt = user.name ?? "Cloud profile";
  cloudProfilePhotoInput.value = "";
  setProfileDisabled(false);
};

export const resetCloudProfileDraft = () => {
  pendingPhotoUrl = null;
  if (cloudProfilePhotoInput) {
    cloudProfilePhotoInput.value = "";
  }
  syncCloudProfileForm();
};

export const setupCloudProfileControls = () => {
  if (!cloudProfilePhotoInput || !cloudProfileSaveButton) {
    return;
  }

  cloudProfilePhotoInput.addEventListener("change", async () => {
    const file = cloudProfilePhotoInput.files?.[0];
    if (!file) {
      pendingPhotoUrl = null;
      syncCloudProfileForm();
      return;
    }
    if (!file.type.startsWith("image/")) {
      showToast("Choose an image file for your avatar.", "error");
      cloudProfilePhotoInput.value = "";
      return;
    }
    try {
      pendingPhotoUrl = await readFileAsDataUrl(file);
      if (cloudProfileAvatar) {
        cloudProfileAvatar.src = pendingPhotoUrl;
      }
    } catch (error) {
      console.error(error);
      showToast("Unable to read that image.", "error");
      pendingPhotoUrl = null;
      cloudProfilePhotoInput.value = "";
      syncCloudProfileForm();
    }
  });

  cloudProfileSaveButton.addEventListener("click", async () => {
    if (!firebaseClient) {
      showToast("Firebase is not configured yet.", "error");
      return;
    }
    const currentUser = firebaseClient.auth.currentUser;
    if (!currentUser || !cloudState.user) {
      showToast("Sign in to update your profile.", "info");
      return;
    }
    if (!cloudProfileNameInput) {
      return;
    }
    const name = cloudProfileNameInput.value.trim();
    if (!name) {
      showToast("Add a display name to continue.", "error");
      return;
    }

    const updates: { displayName?: string | null; photoURL?: string | null } =
      {};
    if (name !== cloudState.user.name) {
      updates.displayName = name;
    }
    if (pendingPhotoUrl) {
      updates.photoURL = pendingPhotoUrl;
    }

    if (Object.keys(updates).length === 0) {
      showToast("No profile changes to save.", "info");
      return;
    }

    cloudProfileSaveButton.disabled = true;
    try {
      await updateProfile(currentUser, updates);
      cloudState.user = {
        ...cloudState.user,
        name,
        photoUrl: pendingPhotoUrl ?? cloudState.user.photoUrl ?? null,
      };
      pendingPhotoUrl = null;
      renderCloudUserCard();
      syncCloudProfileForm();
      showToast("Profile updated.", "success");
    } catch (error) {
      console.error(error);
      showToast("Unable to update your profile.", "error");
    } finally {
      cloudProfileSaveButton.disabled = !cloudState.user;
    }
  });

  syncCloudProfileForm();
};
