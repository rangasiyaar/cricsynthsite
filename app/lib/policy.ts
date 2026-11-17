"use client";
// The Android app's privacy-policy acceptance and its usage-analytics switch. There is no separate analytics consent
// pop-up in the app: the privacy policy explains the analytics, people accept the policy (lib + components/PolicyPrompt),
// and Settings has a "Share anonymous usage analytics" switch (on by default) that turns it off at any time.
// Analytics runs only when the current policy version is accepted AND the switch is on. Stored on the phone only.
export const POLICY_VERSION = "2026-11-17";
const ACCEPT = "cs-policy", DEFERRED = "cs-policy-later", PREF = "cs-app-analytics";
type Listener = () => void;
const listeners = new Set<Listener>();
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };

export function policyAccepted(): { v: string; at: string } | null {
  try { const a = JSON.parse(get(ACCEPT) || "null"); return a?.v === POLICY_VERSION ? a : null; } catch { return null; }
}
export function acceptPolicy() {
  set(ACCEPT, JSON.stringify({ v: POLICY_VERSION, at: new Date().toISOString() }));
  set(DEFERRED, null);
  listeners.forEach((f) => f());
}
/** "Not now" on the first prompt: the next prompt is the reminder (accept only). */
export const deferPolicy = () => set(DEFERRED, POLICY_VERSION);
export const policyDeferred = () => get(DEFERRED) === POLICY_VERSION;

export const analyticsPref = () => get(PREF) !== "off";
export function setAnalyticsPref(on: boolean) { set(PREF, on ? "on" : "off"); listeners.forEach((f) => f()); }

/** Analytics may run: policy accepted and the switch on. */
export const appAnalyticsAllowed = () => Boolean(policyAccepted()) && analyticsPref();
export function onPolicyChange(f: Listener): () => void { listeners.add(f); return () => { listeners.delete(f); }; }
/** Date the current policy was accepted, e.g. "17 Nov 2026", or null. */
export function acceptedOn(): string | null {
  const a = policyAccepted();
  return a ? new Date(a.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
}
