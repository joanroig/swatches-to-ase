import { cloudAuthSection, cloudAuthSwitchButton, cloudPasswordInput } from "../dom";
import { t } from "../i18n";

/**
 * Whether the cloud modal is showing the sign-in or the sign-up form.
 *
 * Its own module because both the eager action wiring and the lazily loaded auth handlers need to
 * read and set it, and it must not drag the Firebase SDK along with it.
 */

export type CloudAuthMode = "signin" | "signup";

let currentMode: CloudAuthMode = "signin";

export const getCloudAuthMode = () => currentMode;

export const setCloudAuthMode = (mode: CloudAuthMode) => {
  currentMode = mode;
  if (cloudAuthSection) {
    cloudAuthSection.dataset.mode = mode;
  }
  if (cloudAuthSwitchButton) {
    cloudAuthSwitchButton.textContent = t(mode === "signin" ? "cloud.auth.switch.signup" : "cloud.auth.switch.signin");
  }
  if (cloudPasswordInput) {
    cloudPasswordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
  }
};
