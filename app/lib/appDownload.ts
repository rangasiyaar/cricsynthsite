"use client";
// The Android app download: the latest signed release, copied into the site at /download/ when it's published
// (publish-site.yml writes /download/app.json next to the APK).
import { useEffect, useState } from "react";

export type AppInfo = { version: string | null; build: number | null; bytes: number; sha256: string; updated: string; url: string };

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
