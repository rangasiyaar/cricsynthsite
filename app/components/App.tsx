"use client";
// The Android app's frame (screens under /m/): a top bar instead of the site nav, the phone's back button,
// the native splash and status bar. The screens themselves reuse the website's match centre and Lab.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Shell";
import { usePlan } from "@/lib/firebase";
import { hideSplash, onBackButton, themeStatusBar } from "@/lib/native";

// Screens where the back button closes the app instead of going back.
const TOP = new Set(["/", "/index.html", "/m/", "/m/index.html", "/m/matches/", "/m/login/"]);

export function AppRuntime() {
  useEffect(() => {
    hideSplash();
    const html = document.documentElement;
    const paint = () => themeStatusBar(html.getAttribute("data-theme") === "dark");
    paint();
    const seen = new MutationObserver(paint);
    seen.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    let off = () => {};
    onBackButton(() => {
      if (TOP.has(window.location.pathname)) return false;
      window.history.back();
      return true;
    }).then((f) => { off = f; });
    return () => { seen.disconnect(); off(); };
  }, []);
  return null;
}

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
);

export function AppBar({ back, title, eyebrow, right }: { back?: string; title?: React.ReactNode; eyebrow?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="app-bar">
      {back ? <Link href={back} className="app-ib" aria-label="Back"><BackIcon /></Link> : (
        <Link href="/m/matches/" className="cs-brand app-brand" aria-label="CricSynthesis matches"><Logo /><span>Cric<b>Synthesis</b></span></Link>
      )}
      {title !== undefined && (
        <div className="app-bar-title">
          {eyebrow && <div className="app-bar-eyebrow">{eyebrow}</div>}
          <div className="app-bar-name">{title}</div>
        </div>
      )}
      <div className="app-bar-right">{right}</div>
    </header>
  );
}

/** The signed-in account's initials, linking to Account; "Sign in" for guests. */
export function AccountButton() {
  const { user } = usePlan();
  if (user === undefined) return <span className="app-ib" style={{ visibility: "hidden" }} />;
  if (!user) return <Link href="/m/login/" className="app-signin">Sign in</Link>;
  const name = user.displayName || user.email || "?";
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return <Link href="/m/account/" className="app-ib app-avatar" aria-label="Account">{initials}</Link>;
}

/** The current time, ticking every `ms` (null until mounted, so the static HTML has no clock in it). */
export function useNow(ms = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Sends guests to sign-in (and back here afterwards); shows Pro's pitch to accounts without it. */
export function AppGate({ children, pro = false }: { children: React.ReactNode; pro?: boolean }) {
  const { user, plan } = usePlan();
  const router = useRouter();
  useEffect(() => {
    if (user === null) router.replace(`/m/login/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [user, router]);
  if (plan === undefined || user === null) return <div className="skeleton card" style={{ minHeight: 280 }} aria-busy="true" />;
  if (pro && plan !== "pro") {
    return (
      <div className="card">
        <h3>MatchSynth Lab is part of Pro <span className="tag pro">Pro</span></h3>
        <p className="small muted">Pro adds the full what-if engine: pitch and conditions, dew, player form, bowler
          availability and any match situation, re-simulated on your phone.</p>
      </div>
    );
  }
  return <>{children}</>;
}
