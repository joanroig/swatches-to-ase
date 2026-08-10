import {
  cloudChangeEmailButton,
  cloudDeleteAccountButton,
  cloudEmailSignInButton,
  cloudEmailSignUpButton,
  cloudPasswordResetButton,
  cloudSignInButton,
  cloudSignOutButton,
  cloudSyncButton,
  cloudVerifyEmailButton,
} from "../dom";
import { loadCloud } from "./lazy";

/**
 * Wires the cloud buttons to their handlers.
 *
 * The listeners are attached eagerly and synchronously — only the work behind them is lazy. An
 * earlier version bound the listeners themselves from inside the dynamic import, which meant a
 * click landing in the window before the chunk arrived did nothing at all: the button looked alive
 * and silently ignored you. Binding here costs nothing and closes that window entirely.
 *
 * Re-entrant clicks are dropped through an in-flight set rather than by toggling `disabled`.
 * `updateCloudControls` owns the enabled state of these buttons and recomputes it whenever auth
 * changes; a handler that also wrote `disabled` would race it and, on the sign-in path, re-enable a
 * button that had just been correctly disabled.
 */

type CloudAction = keyof Awaited<ReturnType<typeof loadCloud>>;

const inFlight = new Set<CloudAction>();

const bind = (button: HTMLButtonElement | null, action: CloudAction) => {
  button?.addEventListener("click", async () => {
    if (inFlight.has(action)) {
      return;
    }
    inFlight.add(action);
    try {
      const cloud = await loadCloud();
      await (cloud[action] as () => unknown | Promise<unknown>)();
    } catch (error) {
      console.error(`[cloud] "${action}" failed.`, error);
    } finally {
      inFlight.delete(action);
    }
  });
};

export const setupCloudAuthBindings = () => {
  bind(cloudSignInButton, "signInWithGoogle");
  bind(cloudEmailSignInButton, "signInWithEmail");
  bind(cloudEmailSignUpButton, "signUpWithEmail");
  bind(cloudPasswordResetButton, "sendPasswordReset");
  bind(cloudVerifyEmailButton, "resendVerificationEmail");
  bind(cloudSignOutButton, "signOutOfCloud");
  bind(cloudDeleteAccountButton, "deleteAccount");
  bind(cloudChangeEmailButton, "changeEmail");
  bind(cloudSyncButton, "syncNow");
};
