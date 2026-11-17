// Cookie consent for the website: nothing optional loads until the visitor chooses. The choice lives on this device
// (localStorage "cs-consent") for 12 months, then we ask again; a new VERSION (e.g. a new tool) asks again too.
// Withdrawing deletes the cookies the optional tools set. The Android app asks separately (later phase).
export const CONSENT_VERSION = 1;
const KEY = "cs-consent";
const MAX_AGE_MS = 365 * 86400_000;

export type Consent = { v: number; analytics: boolean; recordings: boolean; at: string };
type Listener = (c: Consent | null) => void;
const listeners = new Set<Listener>();

export function getConsent(): Consent | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null") as Consent | null;
    if (!c || c.v !== CONSENT_VERSION || !(Date.now() - Date.parse(c.at) < MAX_AGE_MS)) return null;
    return c;
  } catch { return null; }
}

export function setConsent(analytics: boolean, recordings: boolean): Consent {
  const c: Consent = { v: CONSENT_VERSION, analytics, recordings, at: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {}
  if (!analytics) clearCookies(/^_ga/);
  if (!recordings) clearCookies(/^_cl(ck|sk)$|^CLID$|^MUID$/);
  listeners.forEach((f) => f(c));
  return c;
}

export function onConsent(f: Listener): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

/** Open the banner again (footer "Cookie settings"). */
export const openConsent = () => window.dispatchEvent(new Event("cs-consent-open"));

function clearCookies(name: RegExp) {
  const host = location.hostname, parts = host.split(".");
  const domains = ["", host, ...parts.map((_, i) => "." + parts.slice(i).join(".")).filter((d) => d.split(".").length > 2)];
  for (const pair of document.cookie.split(";")) {
    const n = pair.split("=")[0].trim();
    if (!name.test(n)) continue;
    for (const d of domains) document.cookie = `${n}=; Max-Age=0; Path=/${d ? `; Domain=${d}` : ""}`;
  }
}
