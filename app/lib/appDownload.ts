"use client";
// The Android app download: /download/cricsynthesis.apk redirects to the latest signed release on GitHub
// (firebase.json); publish-site.yml writes /download/app.json with its version and size.
import { useEffect, useState } from "react";

export type AppInfo = { version: string; build: number; bytes: number; updated: string; url: string };

export const APK_URL = "/download/cricsynthesis.apk";

let cached: Promise<AppInfo | null> | null = null;
function loadAppInfo(): Promise<AppInfo | null> {
  cached ??= fetch("/download/app.json", { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<AppInfo>) : null))
    .catch(() => null);
  return cached;
}

/** undefined while loading, null when there is no app to download yet. */
export function useAppInfo(): AppInfo | null | undefined {
  const [info, setInfo] = useState<AppInfo | null | undefined>(undefined);
  useEffect(() => { loadAppInfo().then(setInfo); }, []);
  return info;
}

export const isAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

export const sizeMB = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
