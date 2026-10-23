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

// ── match alerts (Firebase Cloud Messaging topics; sent by the nightly publish, cricsim/notify.py) ─────────────────
export type AlertTopic = "forecasts" | "xis";
export const ALERTS: { topic: AlertTopic; title: string; sub: string }[] = [
  { topic: "forecasts", title: "New forecasts", sub: "When a match's forecast is published" },
  { topic: "xis", title: "Playing XIs named", sub: "When a forecast is re-run with the confirmed teams" },
];
const ALERT_KEY = "cs-alerts";

/** Alerts need the native messaging plugin, which the app carries once its Firebase config is set up. */
export const hasAlerts = () => isNative() && !!cap()?.isPluginAvailable?.("FirebaseMessaging");

/** The topics this phone is subscribed to, or null if the person hasn't been asked yet. */
export function alertChoice(): AlertTopic[] | null {
  try { const v = localStorage.getItem(ALERT_KEY); return v === null ? null : (JSON.parse(v) as AlertTopic[]); } catch { return null; }
}

/** Subscribe to exactly `topics` (asking for notification permission first); returns what is now on. */
export async function setAlerts(topics: AlertTopic[]): Promise<AlertTopic[]> {
  if (!hasAlerts()) return [];
  const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
  if (topics.length) {
    const p = await FirebaseMessaging.requestPermissions();
    if (p.receive !== "granted") topics = [];
  }
  for (const a of ALERTS) {
    const on = topics.includes(a.topic);
    await (on ? FirebaseMessaging.subscribeToTopic({ topic: a.topic }) : FirebaseMessaging.unsubscribeFromTopic({ topic: a.topic })).catch(() => {});
  }
  try { localStorage.setItem(ALERT_KEY, JSON.stringify(topics)); } catch {}
  return topics;
}

/** Tapping an alert: `open` gets the app path it points at (alerts carry a `path` like /m/match/?id=…). */
export async function onAlertTap(open: (path: string) => void): Promise<() => void> {
  if (!hasAlerts()) return () => {};
  const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
  const h = await FirebaseMessaging.addListener("notificationActionPerformed", (e) => {
    const path = (e.notification.data as { path?: unknown } | undefined)?.path;
    if (typeof path === "string" && /^\/m\/[\w/?=&%.-]*$/.test(path)) open(path);
  });
  return () => { h.remove(); };
}

// ── crash reports (Firebase Crashlytics: native crashes by itself, script errors from here) ───────────────────────
export const hasCrashReports = () => isNative() && !!cap()?.isPluginAvailable?.("FirebaseCrashlytics");

export async function reportError(message: string) {
  if (!hasCrashReports()) return;
  const { FirebaseCrashlytics } = await import("@capacitor-firebase/crashlytics");
  await FirebaseCrashlytics.recordException({ message: message.slice(0, 1000) }).catch(() => {});
}
