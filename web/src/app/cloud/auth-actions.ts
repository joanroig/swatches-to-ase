import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import { cloudEmailInput, cloudPasswordInput } from "../dom";
import { t } from "../i18n";
import { syncActivePalette } from "../palette/mutations";
import { cloudState, state } from "../state";
import { showToast } from "../ui/notifications";
import { trackEvent } from "./analytics";
import { setCloudAuthMode, type CloudAuthMode } from "./auth-mode";
import { firebaseClient } from "./context";
import { deleteCloudAccount } from "./delete";
import { reportAuthError } from "./errors";
import { syncToCloud } from "./sync";

/**
 * Every cloud auth handler: sign in, sign up, password reset, email verification, sign out and
 * account deletion.
 *
 * Split out of `actions.ts` for two reasons. It was ~260 lines of a 970-line file with a single
 * concern, and it was the last thing statically importing `firebase/auth` from the eager bundle —
 * so lifting it out is what lets the SDK load lazily.
 */

export const signInWithGoogle = async () => {
  if (!firebaseClient) {
    showToast(t("toast.firebaseMissing"), "error");
    return;
  }
  try {
    await signInWithPopup(firebaseClient.auth, firebaseClient.provider);
    trackEvent("sign_in", { method: "google" });
  } catch (error) {
    reportAuthError("Google sign-in", error, "toast.signInFailed");
  }
};

const resolveEmailAuthPayload = () => {
  const email = cloudEmailInput?.value.trim() ?? "";
  const password = cloudPasswordInput?.value ?? "";
  if (!email || !password) {
    showToast(t("toast.emailAuthMissing"), "info");
    return null;
  }
  return { email, password };
};

const resolveEmailOnly = () => {
  const email = cloudEmailInput?.value.trim() ?? "";
  if (!email) {
    showToast(t("toast.emailMissing"), "info");
    return null;
  }
  return email;
};

export const signInWithEmail = async () => {
  if (!firebaseClient) {
    showToast(t("toast.firebaseMissing"), "error");
    return;
  }
  const payload = resolveEmailAuthPayload();
  if (!payload) {
    return;
  }
  try {
    await signInWithEmailAndPassword(firebaseClient.auth, payload.email, payload.password);
    trackEvent("sign_in", { method: "password" });
    if (cloudPasswordInput) {
      cloudPasswordInput.value = "";
    }
  } catch (error) {
    reportAuthError("Email sign-in", error, "toast.signInFailed");
  }
};

export const signUpWithEmail = async () => {
  if (!firebaseClient) {
    showToast(t("toast.firebaseMissing"), "error");
    return;
  }
  const payload = resolveEmailAuthPayload();
  if (!payload) {
    return;
  }
  try {
    const credential = await createUserWithEmailAndPassword(firebaseClient.auth, payload.email, payload.password);
    trackEvent("sign_up", { method: "password" });
    if (cloudPasswordInput) {
      cloudPasswordInput.value = "";
    }
    try {
      await sendEmailVerification(credential.user);
      showToast(t("toast.verifyEmailSent"), "success");
    } catch (error) {
      reportAuthError("Send verification email", error, "toast.verifyEmailFailed");
    }
  } catch (error) {
    reportAuthError("Email sign-up", error, "toast.signUpFailed");
  }
};

export const sendPasswordReset = async () => {
  if (!firebaseClient) {
    showToast(t("toast.firebaseMissing"), "error");
    return;
  }
  const email = resolveEmailOnly();
  if (!email) {
    return;
  }
  try {
    await sendPasswordResetEmail(firebaseClient.auth, email);
    showToast(t("toast.passwordResetSent"), "success");
  } catch (error) {
    reportAuthError("Password reset", error, "toast.passwordResetFailed");
  }
};

export const resendVerificationEmail = async () => {
  if (!firebaseClient) {
    showToast(t("toast.firebaseMissing"), "error");
    return;
  }
  const currentUser = firebaseClient.auth.currentUser;
  if (!currentUser) {
    showToast(t("toast.verifyEmailSignIn"), "info");
    return;
  }
  if (currentUser.emailVerified) {
    showToast(t("toast.verifyEmailAlready"), "info");
    return;
  }
  try {
    await sendEmailVerification(currentUser);
    showToast(t("toast.verifyEmailSent"), "success");
  } catch (error) {
    reportAuthError("Resend verification email", error, "toast.verifyEmailFailed");
  }
};

const handleCloudSignOut = async (options: { prefillEmail?: string; nextAuthMode?: CloudAuthMode } = {}) => {
  if (!firebaseClient) {
    return;
  }
  try {
    if (state.palettes.length > 0) {
      // Phrased so that dismissing the dialog keeps the palettes. It used to be the other way
      // round: cancelling the "keep them?" prompt silently wiped the whole local library.
      const clearLocal = window.confirm(t("cloud.signOutClearLocalConfirm", { count: state.palettes.length }));
      cloudState.applyingRemote = true;
      if (clearLocal) {
        state.palettes = [];
        syncActivePalette(null);
      } else {
        state.palettes.forEach((palette) => {
          palette.isPublic = false;
          palette.publicId = null;
        });
        syncActivePalette(state.activePaletteId);
      }
      cloudState.applyingRemote = false;
    }
    await signOut(firebaseClient.auth);
    if (cloudEmailInput && options.prefillEmail) {
      cloudEmailInput.value = options.prefillEmail;
    }
    if (cloudPasswordInput) {
      cloudPasswordInput.value = "";
    }
    if (options.nextAuthMode) {
      setCloudAuthMode(options.nextAuthMode);
    }
  } catch (error) {
    reportAuthError("Sign out", error, "toast.signOutFailed");
  }
};

export const signOutOfCloud = async () => {
  await handleCloudSignOut();
};

export const deleteAccount = async () => {
  if (!firebaseClient) {
    showToast(t("toast.firebaseMissing"), "error");
    return;
  }
  if (!firebaseClient.auth.currentUser) {
    showToast(t("toast.deleteAccountFailed"), "error");
    return;
  }
  const confirmed = window.confirm(t("cloud.deleteAccountConfirm"));
  if (!confirmed) {
    return;
  }
  const runDelete = async () => {
    const result = await deleteCloudAccount();
    if (result === "success") {
      showToast(t("toast.deleteAccountSuccess"), "success");
      return true;
    }
    if (result === "reauth") {
      return false;
    }
    showToast(t("toast.deleteAccountFailed"), "error");
    return null;
  };

  const initial = await runDelete();
  if (initial !== false) {
    return;
  }

  const user = firebaseClient.auth.currentUser;
  if (!user) {
    showToast(t("toast.deleteAccountFailed"), "error");
    return;
  }

  const providers = new Set(user.providerData.map((provider) => provider.providerId));
  const tryReauth = async () => {
    if (providers.has("google.com")) {
      try {
        await reauthenticateWithPopup(user, firebaseClient.provider);
        return true;
      } catch (error) {
        console.warn("[cloud] Re-auth with Google failed.", error);
        return false;
      }
    }
    if (providers.has("password")) {
      const email = user.email ?? cloudEmailInput?.value.trim() ?? "";
      if (!email) {
        return false;
      }
      const password = window.prompt(t("cloud.deleteAccountPasswordPrompt"));
      if (!password) {
        return false;
      }
      try {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, password));
        return true;
      } catch (error) {
        console.warn("[cloud] Re-auth with password failed.", error);
        return false;
      }
    }
    return false;
  };

  const reauthed = await tryReauth();
  if (!reauthed) {
    showToast(t("toast.deleteAccountReauth"), "info");
    return;
  }

  const retry = await runDelete();
  if (retry === false) {
    showToast(t("toast.deleteAccountFailed"), "error");
  }
};

export const changeEmail = async () => {
  const email = cloudState.user?.email ?? cloudEmailInput?.value.trim() ?? "";
  await handleCloudSignOut({ prefillEmail: email, nextAuthMode: "signup" });
};

export const syncNow = () => {
  void syncToCloud("manual");
};
