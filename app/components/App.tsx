"use client";
// The Android app's own interface (screens under /m/): the website's colours, type and team colours, laid out as a
// phone app — a top bar with a real back action, large titles, grouped menus that open one screen per section.
// Section content (charts, tables) comes from the match centre and Lab components.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TAB_ICONS, type Section } from "@/components/MatchCentre";
import { Logo } from "@/components/Shell";
import { usePlan } from "@/lib/firebase";
import { hideSplash, onBackButton, themeStatusBar } from "@/lib/native";
import type { MatchDoc } from "@/lib/types";

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
      if (TOP.has(window.location.pathname) && !window.location.search.includes("s=")) return false;
      window.history.back();
      return true;
    }).then((f) => { off = f; });
    return () => { seen.disconnect(); off(); };
  }, []);
  return null;
}

// ── icons ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const svg = (d: string, size = 20) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
export const Icon = {
  back: svg("M15 5l-7 7 7 7"),
  chevron: svg("M9 6l6 6-6 6", 18),
  share: svg("M12 15V3M7 8l5-5 5 5M5 13v7h14v-7"),
  lab: TAB_ICONS.Lab,
  scene: svg("M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4"),
  centre: TAB_ICONS.Overview,
  refresh: svg("M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"),
};

// ── top bar ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** Goes back a screen, or to `fallback` when the app was opened straight onto this one. */
export function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  const back = () => {
    if (window.history.length > 2) router.back();
    else router.replace(fallback);
  };
  return <button type="button" className="a-icon" aria-label="Back" onClick={back}>{Icon.back}</button>;
}

/** The bar at the top of every screen: back (or the logo on a top-level screen), a title once it scrolls, actions. */
export function TopBar({ back, title, right }: { back?: string; title?: React.ReactNode; right?: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`a-top${scrolled ? " is-scrolled" : ""}`}>
      {back ? <BackButton fallback={back} /> : <span className="a-mark" aria-hidden="true"><Logo /></span>}
      <div className="a-top-title">{title}</div>
      <div className="a-top-actions">{right}</div>
    </header>
  );
}

/** A screen's large title, with an optional line above (eyebrow) and below (subtitle). */
export function Title({ eyebrow, children, sub }: { eyebrow?: React.ReactNode; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="a-title">
      {eyebrow && <div className="a-eyebrow">{eyebrow}</div>}
      <h1>{children}</h1>
      {sub && <p>{sub}</p>}
    </div>
  );
}

/** The signed-in account's initials, linking to Account; "Sign in" for guests. */
export function AccountButton() {
  const { user } = usePlan();
  if (user === undefined) return <span className="a-icon" style={{ visibility: "hidden" }} />;
  if (!user) return <Link href="/m/login/" className="a-pill">Sign in</Link>;
  return <Link href="/m/account/" className="a-avatar" aria-label="Account">{initials(user.displayName || user.email || "?")}</Link>;
}
export const initials = (name: string) =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

// ── match pieces ──────────────────────────────────────────────────────────────────────────────────────────────────
export const TEAM = ["var(--team-a)", "var(--team-b)"];

export function Badge({ short, k, size = 36 }: { short: string; k: number; size?: number }) {
  return <span className="a-badge" style={{ background: TEAM[k], width: size, height: size, fontSize: Math.round(size * 0.34) }}>{short}</span>;
}

/** Two-colour pill: each side's share of the win chances. */
export function WinPill({ pa, pb, height = 6 }: { pa: number; pb: number; height?: number }) {
  const tie = Math.max(0, 1 - pa - pb);
  return (
    <div className="a-winpill" style={{ height }} role="img" aria-label={`${Math.round(pa * 100)}% to ${Math.round(pb * 100)}%`}>
      <i style={{ width: `${pa * 100}%`, background: TEAM[0] }} />
      {tie > 0.005 && <i style={{ width: `${tie * 100}%`, background: "var(--cs-line)" }} />}
      <i style={{ width: `${pb * 100}%`, background: TEAM[1] }} />
    </div>
  );
}

export const pct0 = (p: number | null | undefined) => (p === null || p === undefined ? "—" : `${Math.round(100 * p)}%`);

/** The top of a match screen: both teams, their chances and the essentials. */
export function MatchHero({ doc, note }: { doc: MatchDoc; note?: React.ReactNode }) {
  const { match, summary: s } = doc;
  const names = s.teams.map((t) => t.name);
  const shorts = match.teams.map((t) => t.short);
  const p = names.map((n) => s.result.win[n] ?? 0);
  return (
    <section className="a-hero">
      <div className="a-hero-teams">
        {[0, 1].map((k) => (
          <div key={k} className={`a-hero-team${k ? " right" : ""}`}>
            <Badge short={shorts[k]} k={k} size={44} />
            <div className="a-hero-name">{names[k]}</div>
            <div className="a-hero-pct" style={{ color: TEAM[k] }}>{pct0(p[k])}</div>
          </div>
        ))}
      </div>
      <WinPill pa={p[0]} pb={p[1]} height={8} />
      <div className="a-hero-meta">{note ?? <>Win chances from {s.meta.simulations.toLocaleString("en-IN")} simulations</>}</div>
    </section>
  );
}

// ── menus ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export const SLUG: Record<Section, string> = {
  Overview: "overview", Scores: "scores", Wickets: "wickets", Players: "players", "Top players": "top", MVP: "mvp", Matchups: "matchups", Fantasy: "fantasy",
};
export const fromSlug = (slug: string | null, list: Section[]) => list.find((x) => SLUG[x] === slug) ?? null;

const ABOUT: Record<Section, string> = {
  Overview: "Who wins and the numbers that decide it",
  Scores: "Totals, phases and how the innings unfold",
  Wickets: "When wickets fall and how they go",
  Players: "Every player's runs, wickets and strike rate",
  "Top players": "Top run-scorer and wicket-taker chances",
  MVP: "Who has the biggest say in the result",
  Matchups: "Batter against bowler, ball by ball",
  Fantasy: "Best team and a five-team combo",
};

/** A one-line read of each section for its menu row. */
export function preview(doc: MatchDoc, section: Section): string {
  const s = doc.summary, short = doc.match.teams.map((t) => t.short);
  try {
    if (section === "Overview") {
      const k = (s.result.win[s.teams[0].name] ?? 0) >= (s.result.win[s.teams[1].name] ?? 0) ? 0 : 1;
      return `${short[k]} ${pct0(s.result.win[s.teams[k].name])} to win`;
    }
    if (section === "Scores") return s.teams.map((t, k) => `${short[k]} ${Math.round(t.batting.score.q["50"] ?? 0)}`).join(" · ") + " projected";
    if (section === "Top players") {
      const top = s.teams.flatMap((t) => t.players).filter((p) => p.batting).sort((a, b) => b.batting!.p_top_scorer - a.batting!.p_top_scorer)[0];
      if (top) return `Top scorer: ${top.name} ${pct0(top.batting!.p_top_scorer)}`;
    }
    if (section === "Fantasy" && doc.fantasy) {
      const c = doc.fantasy.single.captain;
      return `Captain ${doc.fantasy.players[c]?.name ?? c}`;
    }
  } catch { /* a summary without that part: fall back to the description */ }
  return ABOUT[section];
}

export function MenuGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="a-group">
      {label && <div className="a-group-label">{label}</div>}
      <div className="a-menu">{children}</div>
    </div>
  );
}

export function MenuRow({ icon, title, sub, value, href, onClick, tone }: {
  icon: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; value?: React.ReactNode; href?: string; onClick?: () => void; tone?: "accent";
}) {
  const body = (
    <>
      <span className={`a-row-icon${tone ? ` ${tone}` : ""}`}>{icon}</span>
      <span className="a-row-text"><span className="a-row-title">{title}</span>{sub && <span className="a-row-sub">{sub}</span>}</span>
      {value && <span className="a-row-value">{value}</span>}
      <span className="a-row-chev">{Icon.chevron}</span>
    </>
  );
  return href ? <Link href={href} className="a-row">{body}</Link> : <button type="button" className="a-row" onClick={onClick}>{body}</button>;
}

// ── time and access ───────────────────────────────────────────────────────────────────────────────────────────────
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

export function Loading({ rows = 3 }: { rows?: number }) {
  return <div className="a-loading" aria-busy="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="a-shimmer" />)}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return <div className="a-empty"><h2>{title}</h2>{children && <p>{children}</p>}{action}</div>;
}

/** Sends guests to sign-in (and back here afterwards); shows Pro's pitch to accounts without it. */
export function AppGate({ children, pro = false }: { children: React.ReactNode; pro?: boolean }) {
  const { user, plan } = usePlan();
  const router = useRouter();
  useEffect(() => {
    if (user === null) router.replace(`/m/login/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [user, router]);
  if (plan === undefined || user === null) return <Loading rows={2} />;
  if (pro && plan !== "pro") {
    return (
      <Empty title="MatchSynth Lab is part of Pro">
        Pro adds the full what-if engine: pitch and conditions, dew, player form, bowler availability and any match
        situation, re-simulated on your phone.
      </Empty>
    );
  }
  return <>{children}</>;
}
