"use client";
// The Android app's own interface (screens under /m/): the website's colours, type and team colours, laid out as a
// phone app — a top bar with a real back action, large titles, grouped menus that open one screen per section.
// Section content (charts, tables) comes from the match centre and Lab components.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TAB_ICONS, type Section } from "@/components/MatchCentre";
import { Logo } from "@/components/Shell";
import { usePlan } from "@/lib/firebase";
import { appInfo, cmpVersion, hideSplash, tap, upgradeAlerts, latestRelease, onAlertTap, onAlertWhileOpen, onResume, onBackButton, openExternal, reportError, share, signOutNative,
  themeStatusBar, type AppInfo, type Release } from "@/lib/native";
import { TIERS } from "@/lib/plans";
import { SITE } from "@/lib/seo";
import type { MatchDoc } from "@/lib/types";

// Screens where the back button closes the app instead of going back.
const TOP = new Set(["/", "/index.html", "/m/", "/m/index.html", "/m/matches/", "/m/login/"]);

const SPLASH = new Set(["/", "/index.html", "/m/", "/m/index.html"]);   // the update prompt waits until the app is past these
const LATER_KEY = "cs-update-later";      // "<build>:<time>": "Later" hides that build's prompt for a day

export function AppRuntime() {
  const router = useRouter();
  const pathname = usePathname();
  const [update, setUpdate] = useState<Release | null>(null);
  const [mine, setMine] = useState("");
  const [alert, setAlert] = useState<{ title: string; body: string; path?: string } | null>(null);
  useEffect(() => {
    // a newer release on the site: offer it when the app opens, and again each time it comes back to the screen
    // (Later hides it for a day, per build)
    let live = true;
    const check = () => Promise.all([appInfo(), latestRelease(SITE)]).then(([me, rel]) => {
      if (!live || !me || !rel || rel.build <= me.build) return;
      try {
        const [b, t] = (localStorage.getItem(LATER_KEY) ?? "").split(":").map(Number);
        if (b === rel.build && Date.now() - t < 86_400_000) return;
      } catch {}
      setMine(me.version);
      setUpdate(rel);
    });
    check();
    let offOpen = () => {}, offResume = () => {};
    onAlertWhileOpen(setAlert).then((f) => { offOpen = f; });
    onResume(check).then((f) => { offResume = f; });
    return () => { live = false; offOpen(); offResume(); };
  }, []);
  useEffect(() => { if (!alert) return; const t = setTimeout(() => setAlert(null), 8000); return () => clearTimeout(t); }, [alert]);
  useEffect(() => {
    // script errors go to crash reports (native crashes are reported by the plugin itself)
    const onErr = (e: ErrorEvent) => reportError(`${e.message} @ ${e.filename}:${e.lineno}`);
    const onRej = (e: PromiseRejectionEvent) => reportError(`Unhandled: ${String((e.reason as Error)?.stack ?? e.reason)}`);
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    let offTap = () => {};
    onAlertTap((path) => router.push(path)).then((f) => { offTap = f; });
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); offTap(); };
  }, [router]);
  useEffect(() => {
    hideSplash();
    upgradeAlerts();
    // a light tick under every tap on a button, link, row or switch (Android's own controls do this)
    const tick = (e: Event) => { if ((e.target as Element | null)?.closest?.("button, a, [role=switch], label")) tap(); };
    document.addEventListener("click", tick, true);
    const html = document.documentElement;
    const paint = () => themeStatusBar(html.getAttribute("data-theme") === "dark");
    paint();
    const seen = new MutationObserver(paint);
    seen.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    let off = () => {};
    onBackButton(() => {
      if (drawer.close) { drawer.close(); return true; }
      if (TOP.has(window.location.pathname) && !window.location.search.includes("s=")) return false;
      snapScreen(true);
      window.history.back();
      return true;
    }).then((f) => { off = f; });
    return () => { seen.disconnect(); off(); document.removeEventListener("click", tick, true); };
  }, []);
  const later = () => { try { localStorage.setItem(LATER_KEY, `${update?.build}:${Date.now()}`); } catch {} setUpdate(null); };
  return <>
    {update && !SPLASH.has(pathname) && (
      <div className="a-dialog-wrap" role="dialog" aria-modal="true" aria-labelledby="a-update-title">
        <div className="a-dialog">
          <h2 id="a-update-title">Update available</h2>
          <p>Version {update.version} (build {update.build}) is ready{update.bytes ? `, ${(update.bytes / 1048576).toFixed(1)} MB` : ""}.</p>
          {(() => {
            const news = (update.changes ?? []).filter((c) => cmpVersion(c.version, mine) > 0 && cmpVersion(c.version, update.version) <= 0);
            return news.length > 0 && (
              <details className="a-changes">
                <summary>What&apos;s new</summary>
                {news.map((c) => (
                  <div key={c.version}><b>{c.version}</b><ul>{c.notes.map((n) => <li key={n}>{n}</li>)}</ul></div>
                ))}
              </details>
            );
          })()}
          <button type="button" className="a-btn" onClick={() => { openExternal(update.url); setUpdate(null); }}>Update</button>
          <button type="button" className="a-btn a-btn-quiet" onClick={later}>Later</button>
        </div>
      </div>
    )}
    {alert && (
      <button type="button" className="a-alert" onClick={() => { if (alert.path) router.push(alert.path); setAlert(null); }}>
        <b>{alert.title}</b>{alert.body && <span>{alert.body}</span>}
      </button>
    )}
  </>;
}

/** "0.2.0 (build 17)" from the installed app; "beta" on the website preview. */
export function useAppVersion(): string {
  const [v, setV] = useState("beta");
  useEffect(() => { appInfo().then((i: AppInfo | null) => { if (i) setV(`${i.version} (build ${i.build})`); }); }, []);
  return v;
}

/** Screen changes like the phone's own: going forward, the new screen slides in from the right over the old one, which
 *  drifts left and dims; going back, the current screen slides away to the right and uncovers the one underneath.
 *  The old screen is a frozen copy taken just before the change (a tapped link, or the back button). */
// Module state: the component remounts when the route changes (its Suspense boundary re-suspends), so the copy taken
// before the change and the last route seen live outside it.
const motion: { ghost: { el: HTMLElement; back: boolean } | null; route: string | null } = { ghost: null, route: null };

/** Freeze the current screen before a change: `back` when going back (our back button, the phone's back button). */
export function snapScreen(back: boolean) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const main = document.querySelector<HTMLElement>("main.app-wrap");
  if (!main) return;
  motion.ghost?.el.remove();
  const shell = document.createElement("div");
  shell.className = "a-ghost";
  shell.setAttribute("aria-hidden", "true");
  shell.inert = true;
  const copy = main.cloneNode(true) as HTMLElement;
  const y = window.scrollY;
  copy.style.transform = `translateY(${-y}px)`;
  const bar = copy.querySelector<HTMLElement>(".a-top");
  if (bar) bar.style.transform = `translateY(${y}px)`;          // keep the copy's top bar where it was on screen
  shell.appendChild(copy);
  document.body.appendChild(shell);
  motion.ghost = { el: shell, back };
  setTimeout(() => { if (!shell.dataset.used) { shell.remove(); if (motion.ghost?.el === shell) motion.ghost = null; } }, 1500);
}

export function ScreenMotion() {
  const path = usePathname();
  const query = useSearchParams().toString();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target) return;
      const u = new URL(a.href, window.location.href);
      if (u.origin !== window.location.origin || !u.pathname.startsWith("/m/") || u.href === window.location.href) return;
      snapScreen(false);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  useEffect(() => {
    const route = `${path}?${query}`;
    if (motion.route === null || motion.route === route) { motion.route = route; return; }
    motion.route = route;
    const g = motion.ghost;
    motion.ghost = null;
    const main = document.querySelector<HTMLElement>("main.app-wrap");
    if (!main) return;
    if (!g) {                                                     // a change without a tap (sign-in, splash): just fade
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) main.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
      return;
    }
    g.el.dataset.used = "1";
    if (!g.back) window.scrollTo(0, 0);
    const timing = { duration: 360, easing: "cubic-bezier(.32, .72, 0, 1)" };
    if (!g.back) {
      main.classList.add("is-entering");
      main.animate([{ transform: "translateX(100%)" }, { transform: "none" }], timing).onfinish = () => main.classList.remove("is-entering");
      g.el.animate([{ transform: "none", opacity: 1 }, { transform: "translateX(-28%)", opacity: 0.6 }], { ...timing, fill: "forwards" })
        .onfinish = () => g.el.remove();
    } else {
      g.el.classList.add("is-leaving");
      main.animate([{ transform: "translateX(-28%)", opacity: 0.6 }, { transform: "none", opacity: 1 }], timing);
      g.el.animate([{ transform: "none" }, { transform: "translateX(100%)" }], { ...timing, fill: "forwards" }).onfinish = () => g.el.remove();
    }
  }, [path, query]);
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
    if (window.history.length > 2) { snapScreen(true); router.back(); }
    else router.replace(fallback);
  };
  return <button type="button" className="a-icon" aria-label="Back" onClick={back}>{Icon.back}</button>;
}

/** The bar at the top of every screen: back (when there is somewhere to go back to), the CricSynthesis logo and
 *  name, the screen's own actions, and the menu. */
export function TopBar({ back, right }: { back?: string; right?: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`a-top${scrolled ? " is-scrolled" : ""}`}>
      {back && <BackButton fallback={back} />}
      <Link href="/m/matches/" className={`a-brand${back ? "" : " solo"}`} aria-label="CricSynthesis, matches"><Logo /><span>Cric<b>Synthesis</b></span></Link>
      <div className="a-top-actions">{right}<MenuButton /></div>
    </header>
  );
}

// ── bottom tabs ───────────────────────────────────────────────────────────────────────────────────────────────────
// Matches · Results · Lab · Account, like any Android app; hidden on the splash and sign-in screens.
const NO_TABS = new Set(["/m/", "/m/index.html", "/m/login/", "/"]);

export function TabBar() {
  const path = usePathname();
  if (NO_TABS.has(path)) return null;
  const tabs = [
    { href: "/m/matches/", label: "Matches", icon: MENU_ICONS.matches, on: path.startsWith("/m/match") },
    { href: "/m/fantasy/", label: "Fantasy", icon: TAB_ICONS.Fantasy, on: path.startsWith("/m/fantasy") },
    { href: "/m/lab/", label: "MatchSynth Lab", icon: Icon.lab, on: path.startsWith("/m/lab") },
  ];
  return (
    <nav className="a-tabbar" aria-label="Sections">
      {tabs.map((t) => (
        <Link key={t.label} href={t.href} className={`a-tabbar-item${t.on ? " on" : ""}`} aria-current={t.on ? "page" : undefined}
              onClick={() => tap("medium")}>
          <span className="a-tabbar-ico">{t.icon}</span><span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Swipe left or right on a screen to move to the next or previous one (the match centre's sections). A swipe that
 *  starts on something that scrolls sideways (a wide table, a chart) is left to it. */
export function SwipeNav({ prev, next, children }: { prev?: string | null; next?: string | null; children: React.ReactNode }) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const scrolls = (el: Element | null) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) if (e.scrollWidth > e.clientWidth + 4 && getComputedStyle(e).overflowX !== "visible") return true;
    return false;
  };
  return (
    <div onTouchStart={(e) => { const p = e.touches[0]; start.current = scrolls(e.target as Element) ? null : { x: p.clientX, y: p.clientY, t: Date.now() }; }}
         onTouchEnd={(e) => {
           const s = start.current; start.current = null;
           if (!s) return;
           const p = e.changedTouches[0], dx = p.clientX - s.x, dy = p.clientY - s.y;
           if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || Date.now() - s.t > 600) return;
           const to = dx < 0 ? next : prev;
           if (!to) return;
           tap(); snapScreen(dx > 0); router.replace(to);
         }}>
      {children}
    </div>
  );
}

// ── menu ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// The open menu registers how to close it, so the phone's back button closes the menu before leaving the screen.
const drawer: { close: (() => void) | null } = { close: null };

const MENU_ICONS = {
  close: svg("M6 6l12 12M18 6L6 18"),
  matches: svg("M4 5h16v14H4zM4 10h16M10 10v9"),
  user: svg("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0"),
  settings: svg("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"),
  help: svg("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"),
  results: svg("M4 20V10M10 20V4M16 20v-7M22 20H2"),
  alerts: svg("M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"),
  share: svg("M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4"),
  privacy: svg("M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"),
  terms: svg("M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"),
  logout: svg("M14 17l5-5-5-5M19 12H8M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"),
};

function MenuButton() {
  const { user } = usePlan();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="a-icon" aria-label="Account and menu" aria-expanded={open} onClick={() => setOpen(true)}>
        {user ? <span className="a-avatar a-avatar-top">{initials(user.displayName || user.email || "?")}</span> : MENU_ICONS.user}
      </button>
      {open && <Drawer onClose={() => setOpen(false)} />}
    </>
  );
}

function Drawer({ onClose }: { onClose: () => void }) {
  const { user, plan } = usePlan();
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => { setClosing(true); setTimeout(onClose, 200); }, [onClose]);
  useEffect(() => {
    drawer.close = close;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);
    document.documentElement.classList.add("a-locked");
    return () => { drawer.close = null; document.removeEventListener("keydown", esc); document.documentElement.classList.remove("a-locked"); };
  }, [close]);
  const go = (href: string) => {
    close();
    // once the drawer is gone, slide to the new screen like any other tap
    setTimeout(() => { if (new URL(href, location.href).pathname !== location.pathname) snapScreen(false); router.push(href); }, 220);
  };
  const logOut = async () => {
    const { signOut } = await import("firebase/auth");
    const { auth } = await import("@/lib/firebase");
    await signOutNative(); await signOut(auth());
    close(); router.replace("/m/login/");
  };
  const version = useAppVersion();
  const onShare = () => { share("CricSynthesis", `${SITE}/app/`, "CricSynthesis: cricket forecasts, playing XIs and match simulations"); };
  const Item = ({ icon, label, onClick, href }: { icon: React.ReactNode; label: string; onClick?: () => void; href?: string }) =>
    href ? <a className="a-drawer-item" href={href} onClick={() => close()}>{icon}<span>{label}</span></a>
         : <button type="button" className="a-drawer-item" onClick={onClick}>{icon}<span>{label}</span></button>;
  return (
    <div className={`a-drawer-wrap${closing ? " is-closing" : ""}`} role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" className="a-drawer-scrim" aria-label="Close menu" onClick={close} />
      <nav className="a-drawer">
        <div className="a-drawer-head">
          <span className="a-brand"><Logo /><span>Cric<b>Synthesis</b></span></span>
          <button type="button" className="a-icon" aria-label="Close menu" onClick={close}>{MENU_ICONS.close}</button>
        </div>
        {user ? (
          <button type="button" className="a-drawer-who" onClick={() => go("/m/account/")}>
            <span className="a-avatar">{initials(user.displayName || user.email || "?")}</span>
            <span><b>{user.displayName || "Your account"}</b><small>{user.email}{plan === "pro" ? " · Pro" : ""}</small></span>
          </button>
        ) : user === null ? (
          <div className="a-drawer-guest">
            <p>Sign in for MatchSynth Lab</p>
            <button type="button" className="a-btn" onClick={() => go("/m/login/")}>Sign in</button>
          </div>
        ) : null}
        <div className="a-drawer-list">
          <Item icon={MENU_ICONS.matches} label="Matches" onClick={() => go("/m/matches/")} />
          {user && <Item icon={MENU_ICONS.user} label="Account" onClick={() => go("/m/account/")} />}
          <Item icon={MENU_ICONS.alerts} label="Match alerts" onClick={() => go("/m/alerts/")} />
          <Item icon={MENU_ICONS.settings} label="App settings" onClick={() => go("/m/settings/")} />
          <Item icon={MENU_ICONS.help} label="Help" onClick={() => go("/m/help/")} />
        </div>
        <div className="a-drawer-list">
          <Item icon={MENU_ICONS.results} label="Past results" href={`${SITE}/results/`} />
          <Item icon={MENU_ICONS.share} label="Share the app" onClick={onShare} />
        </div>
        <div className="a-drawer-list">
          <Item icon={MENU_ICONS.privacy} label="Privacy policy" href={`${SITE}/privacy/`} />
          <Item icon={MENU_ICONS.terms} label="Terms of service" href={`${SITE}/terms/`} />
        </div>
        {user && <div className="a-drawer-list"><Item icon={MENU_ICONS.logout} label="Log out" onClick={logOut} /></div>}
        <p className="a-drawer-foot">CricSynthesis for Android · Version {version}</p>
      </nav>
    </div>
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
/** "Lineup Out" once the playing XIs are named, else "Probable XIs".
 *  `fresh` flashes it when the XIs arrive while the screen is open. */
export function XiTag({ xis, fresh }: { xis?: boolean; at?: string; fresh?: boolean }) {
  return <span className={`a-xi${xis ? " in" : ""}${fresh ? " fresh" : ""}`}>{xis ? "Lineup Out" : "Probable XIs"}</span>;
}

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
      {note && <div className="a-hero-meta">{note}</div>}
    </section>
  );
}

// ── menus ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export const SLUG: Record<Section, string> = {
  Overview: "overview", Scores: "scores", Wickets: "wickets", Players: "players", "Top players": "top", MVP: "mvp", Matchups: "matchups", "Venue intelligence": "venue", Fantasy: "fantasy",
};
export const fromSlug = (slug: string | null, list: Section[]) => list.find((x) => SLUG[x] === slug) ?? null;

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
  } catch { /* a summary without that part: no read */ }
  return "";
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

/** A menu row with an on/off switch. */
export function SwitchRow({ title, sub, on, onChange, disabled }: { title: string; sub?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="a-row a-switch-row">
      <span className="a-row-text"><span className="a-row-title">{title}</span>{sub && <span className="a-row-sub">{sub}</span>}</span>
      <input type="checkbox" role="switch" className="a-switch" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

// ── data ──
/** Shows the copy kept on the phone straight away, then the network copy; `offline` when only the kept copy loaded. */
export function useFresh<T>(key: string | null, peek: () => Promise<T | null>, load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const got = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { setData(await loadRef.current()); got.current = true; setError(false); setOffline(false); }
    catch { if (got.current) setOffline(true); else setError(true); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => {
    if (!key) return;
    let live = true;
    got.current = false; setData(null); setError(false); setOffline(false);
    peek().then((d) => { if (live && d && !got.current) { got.current = true; setData(d); } });
    refresh();
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // a failed network load after a kept copy showed up means offline, not an error
  useEffect(() => { if (error && data) { setError(false); setOffline(true); } }, [error, data]);
  return { data, error: error && !data, offline, refreshing, refresh };
}

export function OfflineBar({ show, onRetry }: { show: boolean; onRetry?: () => void }) {
  if (!show) return null;
  return (
    <div className="a-offline" role="status">
      <span>You&apos;re offline. Showing what was saved on this phone.</span>
      {onRetry && <button type="button" onClick={onRetry}>Retry</button>}
    </div>
  );
}

/** Pull down at the top of the screen to load the latest. */
export function PullToRefresh({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  const [pull, setPull] = useState(0);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  useEffect(() => {
    let y0: number | null = null, d = 0;
    const start = (e: TouchEvent) => { y0 = window.scrollY <= 0 ? e.touches[0].clientY : null; d = 0; };
    const move = (e: TouchEvent) => { if (y0 === null) return; d = Math.max(0, e.touches[0].clientY - y0); setPull(Math.min(96, d * 0.5)); };
    const end = () => { if (y0 !== null && d * 0.5 > 64) cb.current(); y0 = null; setPull(0); };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    return () => {
      window.removeEventListener("touchstart", start); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", end);
    };
  }, []);
  const h = refreshing ? 52 : pull;
  return (
    <div className="a-ptr" style={{ height: h, transition: pull ? "none" : "height .25s" }} aria-hidden={!refreshing}>
      {h > 8 && <span className={`a-ptr-spin${refreshing ? " on" : ""}`} style={{ transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, h / 48) }} />}
      {refreshing && <span className="sr-only" role="status">Refreshing</span>}
    </div>
  );
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

const CHECK = svg("M5 12l5 5L20 7", 18);

/** What Pro adds and the plans, before anything else: guests then sign in (and come straight back here); accounts
 *  without Pro see how to get it. */
export function ProPaywall({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const here = typeof window === "undefined" ? "/m/matches/" : window.location.pathname + window.location.search;
  const free = TIERS.find((t) => t.id === "free")!, pro = TIERS.find((t) => t.id === "pro")!;
  return (
    <div className="a-paywall">
      <div className="a-paywall-hero">
        <span className="a-paywall-icon">{Icon.lab}</span>
        <div className="a-eyebrow" style={{ justifyContent: "center" }}>For subscribers <span className="a-pro">Pro</span></div>
        <h1>MatchSynth Lab</h1>
        <p>Change the match. See what moves.</p>
      </div>
      <ul className="a-paywall-list">
        {pro.lines.filter((l) => !l.startsWith("Everything")).map((l) => <li key={l}><span>{CHECK}</span>{l}</li>)}
        <li><span>{CHECK}</span>Fantasy picks rebuilt for your scenario</li>
      </ul>
      <div className="a-group-label">Plans</div>
      <div className="a-plans">
        {[free, pro].map((t) => (
          <div key={t.id} className={`a-plan${t.id === "pro" ? " is-pro" : ""}`}>
            <div className="a-plan-head">
              <span className="a-plan-name">{t.name}</span>
              {t.tag && <span className="a-pro">{t.tag}</span>}
            </div>
            <div className="a-plan-price">{t.price}<span>{t.id === "pro" ? " / month" : ""}</span></div>
            <div className="a-plan-note">{t.note}</div>
            <ul>{t.lines.slice(0, 3).map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        ))}
      </div>
      <div className="a-paywall-cta">
        {!signedIn ? (
          <>
            <Link href={`/m/login/?next=${encodeURIComponent(here)}`} className="a-btn">Sign in to get Pro</Link>
          </>
        ) : (
          <>
            <a href={`${SITE}/pricing/`} className="a-btn">See how to get Pro</a>
          </>
        )}
        <button type="button" className="a-btn plain" onClick={() => (window.history.length > 2 ? router.back() : router.replace("/m/matches/"))}>Not now</button>
      </div>
    </div>
  );
}

/** Pages for signed-in accounts send guests to sign-in (and back afterwards). Pro pages show what Pro adds and the
 *  plans first (ProPaywall), to guests and to accounts without Pro alike. */
export function AppGate({ children, pro = false }: { children: React.ReactNode; pro?: boolean }) {
  const { user, plan } = usePlan();
  const router = useRouter();
  useEffect(() => {
    if (user === null && !pro) router.replace(`/m/login/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [user, router, pro]);
  if (plan === undefined) return <Loading rows={2} />;
  if (pro && plan !== "pro") return <ProPaywall signedIn={!!user} />;
  if (user === null) return <Loading rows={2} />;
  return <>{children}</>;
}
