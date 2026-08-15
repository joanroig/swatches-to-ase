import { cloudAvatar, cloudEmail, cloudName, cloudUserCard, shellAvatarImages } from "../dom";
import { t } from "../i18n";
import { cloudState } from "../state";
import { getCloudAvatarSrc } from "./avatars";

export const renderCloudUserCard = () => {
  if (!cloudUserCard || !cloudAvatar || !cloudName || !cloudEmail) {
    return;
  }
  if (!cloudState.user) {
    cloudUserCard.classList.add("is-hidden");
    cloudAvatar.src = "";
    cloudAvatar.alt = "";
    cloudName.textContent = "";
    cloudEmail.textContent = "";
    const placeholderLabel = t("cloud.profile.name.placeholder");
    shellAvatarImages.forEach((avatar) => {
      avatar.src = getCloudAvatarSrc(null);
      avatar.alt = placeholderLabel;
    });
    return;
  }
  cloudUserCard.classList.remove("is-hidden");
  const avatarSrc = getCloudAvatarSrc(cloudState.user.avatar ?? null);
  cloudAvatar.src = avatarSrc;
  cloudAvatar.alt = cloudState.user.name;
  cloudName.textContent = cloudState.user.name;
  cloudEmail.textContent = cloudState.user.email ?? "";
  shellAvatarImages.forEach((avatar) => {
    avatar.src = avatarSrc;
    avatar.alt = cloudState.user?.name ?? t("cloud.profile.name.placeholder");
  });
};
