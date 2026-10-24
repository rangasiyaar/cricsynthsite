"use client";
// A small card offering the Android app, a few seconds after a page opens. Closing it hides it for a day
// (per browser) for a day; it never shows on the app's own page, sign-in, account or admin, or once someone has downloaded.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Shell";
import { APK_URL, isAndroid, useAppInfo } from "@/lib/appDownload";

const KEY = "cs-app-promo";
const QUIET_DAYS = 1;
const SKIP = ["/app/", "/login/", "/account/", "/admin/"];

function quiet(): boolean {
  try {
    const t = Number(localStorage.getItem(KEY) || 0);
    return Date.now() - t < QUIET_DAYS * 864e5;
  } catch { return true; }                                  // no storage: don't nag on every page
}
function hush() { try { localStorage.setItem(KEY, String(Date.now())); } catch {} }

export function AppPromo() {
  const path = usePathname() || "/";
  const info = useAppInfo();
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [android, setAndroid] = useState(false);
  const skip = SKIP.some((p) => path.startsWith(p));

  useEffect(() => {
    if (!info || skip || quiet()) return;
    setAndroid(isAndroid());
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, [info, skip]);

  useEffect(() => {
    if (!show) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  });

  if (!show || skip) return null;
  function close() { hush(); setLeaving(true); setTimeout(() => setShow(false), 200); }

  return (
    <aside className={`app-promo${leaving ? " is-leaving" : ""}`} role="dialog" aria-label="Get the CricSynthesis app">
      <button type="button" className="app-promo-x" aria-label="Close" onClick={close}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <div className="app-promo-icon"><Logo /></div>
      <div className="app-promo-body">
        <strong>CricSynthesis for Android</strong>
        <p>Every forecast, match alerts and MatchSynth Lab, in an app.</p>
        <div className="app-promo-actions">
          {android
            ? <a className="btn" href={APK_URL} onClick={hush}>Download</a>
            : <Link className="btn" href="/app/" onClick={hush}>Get the app</Link>}
          <button type="button" className="btn ghost" onClick={close}>Not now</button>
        </div>
      </div>
    </aside>
  );
}
