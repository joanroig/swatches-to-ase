import { t } from "../i18n";
import type { PublicPalette } from "../types";
import { createIconButton } from "../ui/buttons";
import { rgbToHex } from "../utils/color";
import { isOwnPalette, isPaletteLiked, isPaletteSaved, savePublicPalette, toggleLikePublicPalette } from "./interactions";

const STRIP_SWATCH_LIMIT = 6;
const SKELETON_SWATCHES = 6;

export const formatCount = (value: number) =>
  new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Math.max(0, value));

export const createDiscoverySkeleton = () => {
  const card = document.createElement("article");
  card.className = "discover-card is-skeleton";
  card.setAttribute("aria-hidden", "true");

  const header = document.createElement("div");
  header.className = "discover-header";
  const title = document.createElement("div");
  title.className = "discover-skeleton discover-skeleton-title";
  const author = document.createElement("div");
  author.className = "discover-skeleton discover-skeleton-author";
  header.append(title, author);

  const strip = document.createElement("div");
  strip.className = "discover-strip discover-strip--skeleton";
  for (let index = 0; index < SKELETON_SWATCHES; index += 1) {
    const chip = document.createElement("span");
    chip.className = "discover-skeleton-swatch";
    strip.appendChild(chip);
  }

  const footer = document.createElement("div");
  footer.className = "discover-footer";
  const likeGroup = document.createElement("div");
  likeGroup.className = "discover-like";
  const likeIcon = document.createElement("span");
  likeIcon.className = "discover-skeleton discover-skeleton-icon";
  const likeCount = document.createElement("span");
  likeCount.className = "discover-skeleton discover-skeleton-count";
  likeGroup.append(likeIcon, likeCount);
  const saveIcon = document.createElement("span");
  saveIcon.className = "discover-skeleton discover-skeleton-icon";
  footer.append(likeGroup, saveIcon);

  card.append(header, strip, footer);
  return card;
};

export type DiscoveryCardOptions = {
  showAuthor?: boolean;
  onProfileClick?: (palette: PublicPalette) => void;
  onOpen: (palette: PublicPalette) => void;
  onChanged: () => void;
};

const createAuthorElement = (palette: PublicPalette, options: DiscoveryCardOptions) => {
  if (!palette.ownerId) {
    const author = document.createElement("div");
    author.className = "discover-author";
    author.textContent = t("discover.shared");
    return author;
  }

  const ownerLabel = palette.ownerName?.trim() || t("cloud.profile.name.placeholder");
  if (!options.onProfileClick) {
    const author = document.createElement("div");
    author.className = "discover-author";
    author.textContent = t("discover.by", { name: ownerLabel });
    return author;
  }

  const authorButton = document.createElement("button");
  authorButton.type = "button";
  authorButton.className = "discover-author discover-author-button";
  authorButton.textContent = t("discover.by", { name: ownerLabel });
  const profileLabel = t("discover.profile.open", { name: ownerLabel });
  authorButton.setAttribute("aria-label", profileLabel);
  authorButton.setAttribute("title", profileLabel);
  authorButton.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onProfileClick?.(palette);
  });
  authorButton.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.stopPropagation();
    }
  });
  return authorButton;
};

export const createDiscoveryCard = (palette: PublicPalette, options: DiscoveryCardOptions) => {
  const card = document.createElement("article");
  card.className = "discover-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.addEventListener("click", () => options.onOpen(palette));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      options.onOpen(palette);
    }
  });

  const isOwner = isOwnPalette(palette);
  const liked = isPaletteLiked(palette.id);
  const saved = isPaletteSaved(palette.id);

  const header = document.createElement("div");
  header.className = "discover-header";
  const title = document.createElement("div");
  title.className = "discover-title";
  title.textContent = palette.name;
  header.appendChild(title);
  if (options.showAuthor !== false) {
    header.appendChild(createAuthorElement(palette, options));
  }

  const strip = document.createElement("div");
  strip.className = "discover-strip";
  palette.colors.slice(0, STRIP_SWATCH_LIMIT).forEach((color) => {
    const chip = document.createElement("span");
    chip.style.background = rgbToHex(color.rgb);
    strip.appendChild(chip);
  });

  const saveButton = createIconButton({
    icon: "bookmark",
    label: saved ? t("action.saved") : t("action.save"),
    iconOnly: true,
    className: "ghost icon-only discover-action",
    onClick: (event) => {
      // The whole card opens the palette, so its buttons must not also trigger that.
      event.stopPropagation();
      saveButton.disabled = true;
      void savePublicPalette(palette).finally(options.onChanged);
    },
  });
  saveButton.classList.toggle("is-active", saved);
  // Saving is one-shot: once saved it stays saved and the count never moves again.
  saveButton.disabled = isOwner || saved;

  const likeButton = createIconButton({
    icon: "heart",
    label: liked ? t("action.liked") : t("action.like"),
    iconOnly: true,
    className: "ghost icon-only discover-action",
    onClick: (event) => {
      event.stopPropagation();
      void toggleLikePublicPalette(palette).finally(options.onChanged);
    },
  });
  likeButton.classList.toggle("is-active", liked);
  likeButton.disabled = isOwner;

  const likeCount = document.createElement("span");
  likeCount.className = "discover-like-count";
  likeCount.textContent = formatCount(palette.likesCount ?? 0);

  const likeGroup = document.createElement("div");
  likeGroup.className = "discover-like";
  likeGroup.append(likeButton, likeCount);

  const footer = document.createElement("div");
  footer.className = "discover-footer";
  footer.append(likeGroup, saveButton);

  card.append(header, strip, footer);
  return card;
};
