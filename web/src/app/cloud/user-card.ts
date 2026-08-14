import { cloudAvatar, cloudEmail, cloudName, cloudUserCard, shellAvatarImages } from "../dom";
import { t } from "../i18n";
import { cloudState } from "../state";
import { getCloudAvatarSrc, setAvatarImage } from "./avatars";

export const renderCloudUserCard = () => {
  if (!cloudUserCard || !cloudAvatar || !cloudName || !cloudEmail) {
    return;
  }
  if (!cloudState.user) {
    cloudUserCard.classList.add("is-hidden");
    setAvatarImage(cloudAvatar, "", "");
    cloudName.textContent = "";
    cloudEmail.textContent = "";
    const placeholderLabel = t("cloud.profile.name.placeholder");
    shellAvatarImages.forEach((avatar) => setAvatarImage(avatar, getCloudAvatarSrc(null), placeholderLabel));
    return;
  }
  cloudUserCard.classList.remove("is-hidden");
  const avatarSrc = getCloudAvatarSrc(cloudState.user.avatar ?? null);
  setAvatarImage(cloudAvatar, avatarSrc, cloudState.user.name);
  cloudName.textContent = cloudState.user.name;
  cloudEmail.textContent = cloudState.user.email ?? "";
  const label = cloudState.user.name || t("cloud.profile.name.placeholder");
  shellAvatarImages.forEach((avatar) => setAvatarImage(avatar, avatarSrc, label));
};
