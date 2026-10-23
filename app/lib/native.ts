"use client";
// The Android app's native side (Capacitor plugins). Each helper does nothing on the website, and the plugins
// are imported only inside the app, so the website bundle never loads them.
import { GoogleAuthProvider, signInWithCredential, type UserCredential } from "firebase/auth";
import { auth, isNative } from "./firebase";

export { isNative };

type CapacitorGlobal = { isPluginAvailable?: (name: string) => boolean };
const cap = () => (typeof window === "undefined" ? undefined : (window as { Capacitor?: CapacitorGlobal }).Capacitor);

/** Google sign-in needs the native Firebase plugin, which the app only carries once its Firebase config is set up. */
export const hasNativeGoogle = () => isNative() && !!cap()?.isPluginAvailable?.("FirebaseAuthentication");

/** Google's account picker on the phone, then the same Firebase session the website uses. */
export async function signInWithGoogleNative(): Promise<UserCredential> {
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  const r = await FirebaseAuthentication.signInWithGoogle();
  const token = r.credential?.idToken;
  if (!token) throw Object.assign(new Error("No Google token"), { code: "auth/popup-closed-by-user" });
  return signInWithCredential(auth(), GoogleAuthProvider.credential(token));
}

export async function signOutNative() {
  if (!hasNativeGoogle()) return;
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  await FirebaseAuthentication.signOut().catch(() => {});
}

export async function hideSplash() {
  if (!isNative()) return;
  const { SplashScreen } = await import("@capacitor/splash-screen");
  await SplashScreen.hide().catch(() => {});
}

/** Status bar colours to match the light or dark theme. */
export async function themeStatusBar(dark: boolean) {
  if (!isNative()) return;
  const { StatusBar, Style } = await import("@capacitor/status-bar");
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
  await StatusBar.setBackgroundColor({ color: dark ? "#111315" : "#f2f2f3" }).catch(() => {});
}

/** Android's back button: `onBack` returns false on a top-level screen, and the app then closes. */
export async function onBackButton(onBack: () => boolean): Promise<() => void> {
  if (!isNative()) return () => {};
  const { App } = await import("@capacitor/app");
  const h = await App.addListener("backButton", () => { if (!onBack()) App.exitApp(); });
  return () => { h.remove(); };
}

/** The phone's share sheet, else the browser's, else copy the link. */
export async function share(title: string, url: string): Promise<"shared" | "copied" | "none"> {
  try {
    if (navigator.share) { await navigator.share({ title, url }); return "shared"; }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch { return "none"; }
}
