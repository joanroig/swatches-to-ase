import { t } from "../i18n";
import { cloudState } from "../state";
import { showToast } from "../ui/notifications";

export const isCloudUserVerified = () => Boolean(cloudState.user?.emailVerified);

export const requireVerifiedCloudUser = (options: { showToast?: boolean } = {}) => {
  if (isCloudUserVerified()) {
    return true;
  }
  if (options.showToast !== false) {
    showToast(t("toast.verifyEmailRequired"), "info");
  }
  return false;
};
