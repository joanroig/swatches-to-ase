/**
 * The Firebase-dependent half of the app, behind a single dynamic import.
 *
 * This barrel exists so there is exactly one edge from the eager bundle into the Firebase graph
 * (`lazy.ts` imports this file, nothing else does). Adding a static import of this module anywhere
 * outside `lazy.ts` would silently put the whole SDK back on the critical path.
 */

export {
  changeEmail,
  deleteAccount,
  resendVerificationEmail,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signOutOfCloud,
  signUpWithEmail,
  syncNow,
} from "./auth-actions";
export {
  fetchUserInteractions,
  listenToDiscovery,
  renderDiscovery,
  savePublicPalette,
  setDiscoveryFollowingOnly,
  setDiscoverySearch,
  setDiscoverySort,
  setupDiscoveryProfileControls,
  sortDiscoveryPalettes,
  toggleLikePublicPalette,
} from "./discovery";
export { resetCloudProfileDraft, setupCloudProfileControls, syncCloudProfileForm } from "./profile";
export { unpublishPalette, upsertPublicPalette } from "./public";
export { refreshCloudControls, refreshCloudUser, scheduleCloudSync, setupCloudAuth, syncToCloud } from "./sync";
