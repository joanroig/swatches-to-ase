import {
  discoverFollowButton,
  discoverProfileAvatar,
  discoverProfileEmpty,
  discoverProfileList,
  discoverProfileModal,
  discoverProfileName,
  discoverProfileStats,
} from "../dom";
import { t } from "../i18n";
import { cloudState, discoveryState } from "../state";
import type { AvatarColors, PublicPalette } from "../types";
import { setModalOpen } from "../ui/modals";
import { getCloudAvatarSrc, setAvatarImage } from "./avatars";
import { createDiscoveryCard, formatCount } from "./discovery-card";
import { fetchPublicProfile, getFollowerCount, isFollowing, toggleFollow } from "./follow";

const activeProfile = {
  ownerId: null as string | null,
  ownerName: null as string | null,
  ownerAvatar: null as AvatarColors | null,
};

const renderFollowButton = () => {
  if (!discoverFollowButton) {
    return;
  }
  const ownerId = activeProfile.ownerId;
  const isSelf = Boolean(ownerId && cloudState.user?.uid === ownerId);
  // Following yourself is meaningless, so the control simply is not offered.
  discoverFollowButton.classList.toggle("is-hidden", !ownerId || isSelf);
  if (!ownerId || isSelf) {
    return;
  }
  const following = isFollowing(ownerId);
  discoverFollowButton.textContent = t(following ? "action.following" : "action.follow");
  discoverFollowButton.classList.toggle("primary", !following);
  discoverFollowButton.classList.toggle("ghost", following);
  discoverFollowButton.setAttribute("aria-pressed", following ? "true" : "false");
};

export const isProfileModalOpen = () => discoverProfileModal?.getAttribute("aria-hidden") === "false";

type ProfileHandlers = {
  sortPalettes: (palettes: PublicPalette[]) => PublicPalette[];
  onOpenPalette: (palette: PublicPalette) => void;
  onChanged: () => void;
};

let handlers: ProfileHandlers | null = null;

export const setDiscoveryProfileHandlers = (next: ProfileHandlers) => {
  handlers = next;
};

const getProfilePalettes = () => {
  if (!activeProfile.ownerId || !handlers) {
    return [] as PublicPalette[];
  }
  return handlers.sortPalettes(discoveryState.palettes).filter((palette) => palette.ownerId === activeProfile.ownerId);
};

export const renderDiscoveryProfile = () => {
  if (
    !handlers ||
    !discoverProfileList ||
    !discoverProfileEmpty ||
    !discoverProfileName ||
    !discoverProfileAvatar ||
    !discoverProfileStats
  ) {
    return;
  }

  const palettes = getProfilePalettes();

  // The card that opened the profile may not have carried a name or avatar; take them from any
  // palette by the same owner.
  if (!activeProfile.ownerName) {
    activeProfile.ownerName = palettes.find((palette) => palette.ownerName)?.ownerName ?? null;
  }
  if (!activeProfile.ownerAvatar) {
    activeProfile.ownerAvatar = palettes.find((palette) => palette.ownerAvatar)?.ownerAvatar ?? null;
  }

  const ownerName = activeProfile.ownerName?.trim() || t("cloud.profile.name.placeholder");
  discoverProfileName.textContent = ownerName;
  setAvatarImage(discoverProfileAvatar, getCloudAvatarSrc(activeProfile.ownerAvatar), ownerName);

  const totalLikes = palettes.reduce((sum, palette) => sum + (palette.likesCount ?? 0), 0);
  const totalSaves = palettes.reduce((sum, palette) => sum + (palette.savesCount ?? 0), 0);
  discoverProfileStats.textContent = t("discover.profile.stats", {
    count: formatCount(palettes.length),
    likes: formatCount(totalLikes),
    saves: formatCount(totalSaves),
    followers: formatCount(activeProfile.ownerId ? getFollowerCount(activeProfile.ownerId) : 0),
  });
  renderFollowButton();

  discoverProfileList.innerHTML = "";
  discoverProfileEmpty.classList.toggle("is-hidden", palettes.length > 0);

  palettes.forEach((palette) => {
    discoverProfileList.appendChild(
      createDiscoveryCard(palette, {
        showAuthor: false,
        onOpen: handlers!.onOpenPalette,
        onChanged: handlers!.onChanged,
      }),
    );
  });
};

export const openDiscoveryProfile = (palette: PublicPalette) => {
  if (!discoverProfileModal || !palette.ownerId) {
    return;
  }
  activeProfile.ownerId = palette.ownerId;
  activeProfile.ownerName = palette.ownerName ?? null;
  activeProfile.ownerAvatar = palette.ownerAvatar ?? null;
  renderDiscoveryProfile();
  setModalOpen(discoverProfileModal, true);
  // The follower count is not carried on the palettes, so fetch it once the panel is up.
  void fetchPublicProfile(palette.ownerId).then((profile) => {
    if (profile && activeProfile.ownerId === profile.uid) {
      activeProfile.ownerName = activeProfile.ownerName ?? profile.name;
      activeProfile.ownerAvatar = activeProfile.ownerAvatar ?? profile.avatar;
      renderDiscoveryProfile();
    }
  });
};

export const setupDiscoveryProfileControls = () => {
  discoverFollowButton?.addEventListener("click", () => {
    const ownerId = activeProfile.ownerId;
    if (!ownerId) {
      return;
    }
    void toggleFollow(ownerId).then(() => {
      renderDiscoveryProfile();
      handlers?.onChanged();
    });
  });
};

export const refreshDiscoveryProfileIfOpen = () => {
  if (isProfileModalOpen()) {
    renderDiscoveryProfile();
  }
};
