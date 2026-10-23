"use client";
// App account: plan, theme, links to the website's account pages, and logging out.
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppBar, AppGate } from "@/components/App";
import { auth, usePlan } from "@/lib/firebase";
import { signOutNative } from "@/lib/native";
import { SITE } from "@/lib/seo";

type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  try { if (t === "system") localStorage.removeItem("cs-theme"); else localStorage.setItem("cs-theme", t); } catch {}
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

function Account() {
  const { user, plan, source } = usePlan();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    let t: string | null = null;
    try { t = localStorage.getItem("cs-theme"); } catch {}
    setTheme(t === "light" || t === "dark" ? t : "system");
  }, []);
  if (!user) return null;
  const name = user.displayName || user.email || "Your account";
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const logOut = async () => { await signOutNative(); await signOut(auth()); router.replace("/m/login/"); };
  return (
    <div className="app-account">
      <div className="app-who">
        <span className="app-avatar big">{initials}</span>
        <div><h1>{user.displayName ? `Hi, ${user.displayName.split(" ")[0]}` : "Your account"}</h1><p className="muted small">{user.email}</p></div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Plan</h3><span className="dash-status pending">{plan === "pro" ? (source === "beta" ? "Pro · beta" : "Pro") : "Free"}</span></div>
        <p className="small muted" style={{ margin: 0 }}>{source === "beta" ? "Every signed-in account gets the full MatchSynth Lab during the beta."
          : plan === "pro" ? "MatchSynth Lab is included in your plan." : "Forecasts and the match centre are free. MatchSynth Lab is part of Pro."}</p>
      </div>
      <div className="card">
        <h3>Appearance</h3>
        <div className="seg">
          {(["light", "dark", "system"] as Theme[]).map((t) => (
            <button key={t} type="button" aria-pressed={theme === t} onClick={() => { setTheme(t); applyTheme(t); }}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>On the website</h3>
        <ul className="dash-links">
          <li><a href={`${SITE}/account/`}>API keys, usage and email preferences</a></li>
          <li><a href={`${SITE}/results/`}>How past forecasts scored</a></li>
          <li><a href={`${SITE}/credits/`}>Data credits</a></li>
          <li><a href={`${SITE}/terms/`}>Terms of Service</a> · <a href={`${SITE}/privacy/`}>Privacy Policy</a></li>
          <li><a href={`${SITE}/contact/`}>Delete your account or contact us</a></li>
        </ul>
      </div>
      <button type="button" className="btn ghost app-logout" onClick={logOut}>Log out</button>
      <p className="small muted app-version mono">CricSynthesis for Android · beta</p>
    </div>
  );
}

export default function AccountPage() {
  return <><AppBar back="/m/matches/" title="Account" /><AppGate><Account /></AppGate></>;
}
