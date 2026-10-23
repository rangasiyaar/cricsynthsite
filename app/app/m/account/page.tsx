"use client";
// App account: plan, appearance, the website's account pages, and logging out.
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppGate, MenuGroup, MenuRow, SwitchRow, TopBar, initials } from "@/components/App";
import { auth, usePlan } from "@/lib/firebase";
import { ALERTS, alertChoice, hasAlerts, setAlerts, signOutNative, type AlertTopic } from "@/lib/native";
import { SITE } from "@/lib/seo";

type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  try { if (t === "system") localStorage.removeItem("cs-theme"); else localStorage.setItem("cs-theme", t); } catch {}
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

const ext = (d: string) => svgPath(d);
function svgPath(d: string) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
const KEY = ext("M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7z");
const CHART = ext("M4 20V10M10 20V4M16 20v-7M22 20H2");
const DOC = ext("M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6");
const HELP = ext("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01");

function Account() {
  const { user, plan, source } = usePlan();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>("system");
  const [alerts, setAlertsOn] = useState<AlertTopic[] | null>(null);
  const [alertsBusy, setAlertsBusy] = useState(false);
  useEffect(() => { if (hasAlerts()) setAlertsOn(alertChoice() ?? []); }, []);
  const flip = async (t: AlertTopic, on: boolean) => {
    setAlertsBusy(true);
    const next = on ? [...(alerts ?? []), t] : (alerts ?? []).filter((x) => x !== t);
    setAlertsOn(await setAlerts(next));
    setAlertsBusy(false);
  };
  useEffect(() => {
    let t: string | null = null;
    try { t = localStorage.getItem("cs-theme"); } catch {}
    setTheme(t === "light" || t === "dark" ? t : "system");
  }, []);
  if (!user) return null;
  const logOut = async () => { await signOutNative(); await signOut(auth()); router.replace("/m/login/"); };
  return (
    <>
      <div className="a-who">
        <span className="a-avatar">{initials(user.displayName || user.email || "?")}</span>
        <div><h1>{user.displayName ? `Hi, ${user.displayName.split(" ")[0]}` : "Your account"}</h1><p>{user.email}</p></div>
      </div>
      <MenuGroup label="Plan">
        <div className="a-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>{plan === "pro" ? "Pro" : "Free"}</h2>{source === "beta" && <span className="a-pro">Beta</span>}
          </div>
          <p>{source === "beta" ? "Every signed-in account gets the full MatchSynth Lab during the beta."
            : plan === "pro" ? "MatchSynth Lab is included in your plan." : "Forecasts and the match centre are free. MatchSynth Lab is part of Pro."}</p>
        </div>
      </MenuGroup>
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
          {ALERTS.map((a) => <SwitchRow key={a.topic} title={a.title} sub={a.sub} on={alerts.includes(a.topic)} disabled={alertsBusy} onChange={(v) => flip(a.topic, v)} />)}
        </MenuGroup>
      )}
      <MenuGroup label="On the website">
        <MenuRow icon={KEY} title="API keys and usage" sub="Keys, limits and email preferences" href={`${SITE}/account/`} />
        <MenuRow icon={CHART} title="How past forecasts scored" sub="Every result, checked" href={`${SITE}/results/`} />
        <MenuRow icon={DOC} title="Terms, privacy and data credits" href={`${SITE}/terms/`} />
        <MenuRow icon={HELP} title="Help, or delete your account" sub="Write to us and we'll take care of it" href={`${SITE}/contact/`} />
      </MenuGroup>
      <button type="button" className="a-btn soft" onClick={logOut}>Log out</button>
      <p className="a-version">CricSynthesis for Android · beta</p>
    </>
  );
}

export default function AccountPage() {
  return <><TopBar back="/m/matches/" title="Account" /><AppGate><Account /></AppGate></>;
}
