import { cloudAvatar, cloudEmail, cloudName, cloudUserCard } from "../dom";
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
    return;
  }
  cloudUserCard.classList.remove("is-hidden");
  cloudAvatar.src = getCloudAvatarSrc(cloudState.user.photoUrl);
  cloudAvatar.alt = cloudState.user.name;
  cloudName.textContent = cloudState.user.name;
  cloudEmail.textContent = cloudState.user.email ?? "";
};
