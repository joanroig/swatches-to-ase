export const CLOUD_AVATAR_PLACEHOLDER = "/avatar-placeholder.svg";

export const getCloudAvatarSrc = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : CLOUD_AVATAR_PLACEHOLDER;
};
