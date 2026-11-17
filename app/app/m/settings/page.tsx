"use client";
// App settings: appearance and the data kept on this phone (match alerts have their own tab).
import { useEffect, useState } from "react";
import { MenuGroup, SwitchRow, TopBar, useAppVersion } from "@/components/App";
import { setAppAnalytics } from "@/lib/native";
import { acceptedOn, analyticsPref, appAnalyticsAllowed, onPolicyChange, setAnalyticsPref } from "@/lib/policy";
import { SITE } from "@/lib/seo";

type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  try { if (t === "system") localStorage.removeItem("cs-theme"); else localStorage.setItem("cs-theme", t); } catch {}
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

/** Forecasts kept for offline use, and Lab settings saved per match. */
async function clearSaved(): Promise<void> {
  try { if ("caches" in window) await caches.delete("cs-data-v1"); } catch {}
  try { Object.keys(localStorage).filter((k) => k.startsWith("cs-lab:")).forEach((k) => localStorage.removeItem(k)); } catch {}
}

export default function Settings() {
  const version = useAppVersion();
  const [theme, setTheme] = useState<Theme>("system");
  const [cleared, setCleared] = useState(false);
  const [share, setShare] = useState(true);
  const [accepted, setAccepted] = useState<string | null>(null);
  useEffect(() => {
    const read = () => { setShare(analyticsPref()); setAccepted(acceptedOn()); };
    read();
    return onPolicyChange(read);
  }, []);
  useEffect(() => {
    let t: string | null = null;
    try { t = localStorage.getItem("cs-theme"); } catch {}
    setTheme(t === "light" || t === "dark" ? t : "system");
  }, []);
  return (
    <>
      <TopBar back="/m/matches/" />
      <div className="a-title"><h1>App settings</h1></div>
      <MenuGroup label="Appearance">
        <div className="a-panel">
          <div className="a-seg" role="group" aria-label="Theme">
            {(["light", "dark", "system"] as Theme[]).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => { setTheme(t); applyTheme(t); }}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>
      </MenuGroup>
      <MenuGroup label="Privacy">
        <SwitchRow title="Share anonymous usage analytics" sub="Which screens and features are used. No ads, no advertising ID."
                   on={share} onChange={(v) => { setAnalyticsPref(v); setShare(v); void setAppAnalytics(appAnalyticsAllowed()); }} />
        <div className="a-panel" style={{ fontSize: 14 }}>
          <a href={`${SITE}/privacy/`} target="_blank" rel="noopener noreferrer">Privacy policy</a>
          {accepted ? ` · accepted ${accepted}` : " · not accepted yet"}
        </div>
      </MenuGroup>
      <MenuGroup label="Saved on this phone">
        <div className="a-panel" style={{ display: "grid", gap: 12 }}>
          <button type="button" className="a-btn soft" disabled={cleared}
                  onClick={async () => { await clearSaved(); setCleared(true); }}>{cleared ? "Cleared" : "Clear saved data"}</button>
        </div>
      </MenuGroup>
      <p className="a-version">CricSynthesis for Android · Version {version}</p>
    </>
  );
}
