import { versionBadge } from "../dom";

export const setupVersionBadge = () => {
  if (!versionBadge) {
    return;
  }
  versionBadge.textContent = `v${__APP_VERSION__}`;
};
