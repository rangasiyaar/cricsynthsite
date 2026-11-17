"use client";
// Android app only. First launch (and after a policy change): the privacy policy with Accept / Not now. If they chose
// Not now, every later launch shows the reminder: only Accept, enabled once "I understand" is ticked. Accepting turns
// on usage analytics unless Settings has it switched off (lib/policy.ts). Also logs app opens and screen views.
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isNative } from "@/lib/firebase";
import { appEvent, appScreen, setAppAnalytics } from "@/lib/native";
import { acceptPolicy, appAnalyticsAllowed, deferPolicy, onPolicyChange, policyAccepted, policyDeferred } from "@/lib/policy";
import { SITE } from "@/lib/seo";

export default function PolicyPrompt() {
  const path = usePathname() || "/m/";
  const [mode, setMode] = useState<"none" | "first" | "reminder">("none");
  const [understood, setUnderstood] = useState(false);

  // which prompt, once per launch
  useEffect(() => {
    if (!isNative() || policyAccepted()) return;
    const t = setTimeout(() => setMode(policyDeferred() ? "reminder" : "first"), 1200);   // after the splash
    return () => clearTimeout(t);
  }, []);

  // analytics follows the policy and the Settings switch
  useEffect(() => {
    if (!isNative()) return;
    let opened = false;
    const sync = () => {
      const on = appAnalyticsAllowed();
      void setAppAnalytics(on);
      if (on && !opened) { opened = true; void appEvent("app_open_cs"); }
    };
    sync();
    return onPolicyChange(sync);
  }, []);

  // screen views (the app is one web view, so each route is reported as a screen)
  useEffect(() => {
    if (!isNative() || !appAnalyticsAllowed()) return;
    const screen = path.replace(/^\/m\/?/, "").replace(/\/$/, "").split("/")[0] || "home";
    void appScreen(screen);
  }, [path]);

  if (mode === "none") return null;
  const accept = () => { acceptPolicy(); setMode("none"); };
  return (
    <div className="a-sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="policy-title">
      <div className="a-sheet">
        <h2 id="policy-title">{mode === "first" ? "Our privacy policy" : "Please accept our privacy policy"}</h2>
        <p>{mode === "first"
          ? "Before you start: here's how CricSynthesis handles your data."
          : "To keep using the app, please read and accept our privacy policy."}</p>
        <ul>
          <li>Forecasts work without an account; accounts are for ages 18+.</li>
          <li>We count how the app is used (screens and features, anonymously) to improve it. No ads, no advertising ID. You can turn this off in Settings.</li>
          <li>Crash reports help us fix problems. They aren&apos;t linked to your account.</li>
        </ul>
        <p><a href={`${SITE}/privacy/`} target="_blank" rel="noopener noreferrer">Read the full privacy policy</a></p>
        {mode === "reminder" && (
          <label className="a-check">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            <span>I understand</span>
          </label>
        )}
        <div className="a-sheet-btns">
          {mode === "first" && <button type="button" className="a-btn soft" onClick={() => { deferPolicy(); setMode("none"); }}>Not now</button>}
          <button type="button" className="a-btn" onClick={accept} disabled={mode === "reminder" && !understood}>Accept</button>
        </div>
      </div>
    </div>
  );
}
