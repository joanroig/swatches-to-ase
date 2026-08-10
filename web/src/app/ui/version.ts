import { deployStamp, versionBadge, versionNumber } from "../dom";

const padNumber = (value: number) => value.toString().padStart(2, "0");

const formatDeployStamp = (raw: string) => {
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return {
      stamp: raw,
      title: undefined,
    };
  }
  const stamp = `${parsed.getUTCFullYear()}${padNumber(parsed.getUTCMonth() + 1)}${padNumber(parsed.getUTCDate())}-${padNumber(
    parsed.getUTCHours(),
  )}${padNumber(parsed.getUTCMinutes())}Z`;
  const title = `Deployed ${parsed.getUTCFullYear()}-${padNumber(parsed.getUTCMonth() + 1)}-${padNumber(
    parsed.getUTCDate(),
  )} ${padNumber(parsed.getUTCHours())}:${padNumber(parsed.getUTCMinutes())} UTC`;
  return { stamp, title };
};

export const setupVersionBadge = () => {
  if (versionNumber) {
    versionNumber.textContent = `v${__APP_VERSION__}`;
  } else if (versionBadge) {
    versionBadge.textContent = `v${__APP_VERSION__}`;
  }

  if (deployStamp) {
    const formatted = formatDeployStamp(__DEPLOY_TIME__);
    if (!formatted) {
      deployStamp.textContent = "";
      deployStamp.hidden = true;
      return;
    }
    deployStamp.hidden = false;
    deployStamp.textContent = formatted.stamp;
    if (formatted.title) {
      deployStamp.title = formatted.title;
    }
  }
};
