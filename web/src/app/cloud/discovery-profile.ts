import {
  discoverProfileAvatar,
  discoverProfileEmpty,
  discoverProfileList,
  discoverProfileModal,
  discoverProfileName,
  discoverProfileStats,
} from "../dom";
import { t } from "../i18n";
import { discoveryState } from "../state";
import type { AvatarColors, PublicPalette } from "../types";
import { setModalOpen } from "../ui/modals";
import { getCloudAvatarSrc } from "./avatars";
import { createDiscoveryCard, formatCount } from "./discovery-card";

const activeProfile = {
  ownerId: null as string | null,
  ownerName: null as string | null,
  ownerAvatar: null as AvatarColors | null,
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
  return handlers
    .sortPalettes(discoveryState.palettes)
    .filter((palette) => palette.ownerId === activeProfile.ownerId);
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
  discoverProfileAvatar.src = getCloudAvatarSrc(activeProfile.ownerAvatar);
  discoverProfileAvatar.alt = ownerName;

  const totalLikes = palettes.reduce((sum, palette) => sum + (palette.likesCount ?? 0), 0);
  const totalSaves = palettes.reduce((sum, palette) => sum + (palette.savesCount ?? 0), 0);
  discoverProfileStats.textContent = t("discover.profile.stats", {
    count: formatCount(palettes.length),
    likes: formatCount(totalLikes),
    saves: formatCount(totalSaves),
  });

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
};

export const refreshDiscoveryProfileIfOpen = () => {
  if (isProfileModalOpen()) {
    renderDiscoveryProfile();
  }
};
