// Plain-language sign-in errors, shared by the website and the app's sign-in screens.
export const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email or password is wrong.",
  "auth/email-already-in-use": "There is already an account with this email. Sign in instead.",
  "auth/weak-password": "Use at least 6 characters for the password.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/popup-closed-by-user": "The Google window was closed before signing in.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/configuration-not-found": "Sign-in isn't available yet. Please try again later.",
  "auth/unauthorized-domain": "Sign-in isn't enabled on this address yet. Please use cricsynthesis.web.app for now.",
  "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
  "auth/operation-not-allowed": "This sign-in method isn't switched on yet.",
};
export const explain = (e: unknown) => MESSAGES[(e as { code?: string }).code ?? ""] ?? "Something went wrong. Please try again.";
