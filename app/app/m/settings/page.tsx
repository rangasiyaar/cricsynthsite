"use client";
// App settings: appearance, match alerts, and the data kept on this phone.
import { useEffect, useState } from "react";
import { APP_VERSION, MenuGroup, SwitchRow, TopBar } from "@/components/App";
import { ALERTS, alertChoice, hasAlerts, setAlerts, type AlertTopic } from "@/lib/native";

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
  const [theme, setTheme] = useState<Theme>("system");
  const [alerts, setAlertsOn] = useState<AlertTopic[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    let t: string | null = null;
    try { t = localStorage.getItem("cs-theme"); } catch {}
    setTheme(t === "light" || t === "dark" ? t : "system");
    if (hasAlerts()) setAlertsOn(alertChoice() ?? []);
  }, []);
  const flip = async (t: AlertTopic, on: boolean) => {
    setBusy(true);
    setAlertsOn(await setAlerts(on ? [...(alerts ?? []), t] : (alerts ?? []).filter((x) => x !== t)));
    setBusy(false);
  };
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
      {alerts && (
        <MenuGroup label="Match alerts">
          {ALERTS.map((a) => <SwitchRow key={a.topic} title={a.title} sub={a.sub} on={alerts.includes(a.topic)} disabled={busy} onChange={(v) => flip(a.topic, v)} />)}
        </MenuGroup>
      )}
      <MenuGroup label="Saved on this phone">
        <div className="a-panel" style={{ display: "grid", gap: 12 }}>
          <p>Forecasts are kept so the app opens offline. Lab settings are kept per match.</p>
          <button type="button" className="a-btn soft" disabled={cleared}
                  onClick={async () => { await clearSaved(); setCleared(true); }}>{cleared ? "Cleared" : "Clear saved data"}</button>
        </div>
      </MenuGroup>
      <p className="a-version">CricSynthesis for Android · {APP_VERSION}</p>
    </>
  );
}
