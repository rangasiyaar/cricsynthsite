// Where and how each signed-in account uses CricSynthesis, for the admin console (Users, user page, App).
// The website and the app post to POST /account/seen when they open or come back to the screen (at most every
// 20 minutes per device, app/lib/activity.ts). One doc per account, users/{uid}/activity/recent:
//   visits      the last 3 days: when, website or app, device / OS / browser, app version, city / region / country
//   lastWeb / lastApp / firstApp / appVersion / appOs / place / agent   kept beyond the 3 days
// Location is Cloudflare's own lookup of the request's IP (city level). The IP address itself is never stored.
// The doc goes with the account (deleteAccountData removes every users/{uid} subcollection).

export interface Store { get(path: string): Promise<Record<string, any> | null>; set(path: string, f: Record<string, unknown>): Promise<unknown> }
export interface Place { city: string | null; region: string | null; country: string | null }
export interface Agent { device: "android" | "ios" | "tablet" | "desktop" | "unknown"; os: string | null; browser: string | null }

export const KEEP_MS = 3 * 86400_000;      // visits shown on the console
export const MAX_VISITS = 150;
export const SAME_VISIT_MS = 30 * 60_000;  // a ping within 30 minutes from the same place and device extends the visit

const clip = (v: unknown, n = 40) => (v == null || v === "" ? null : String(v).slice(0, n));

/** Device, OS and browser from the User-Agent. The app's WebView reports itself as "App". */
export function agentOf(ua: string | null | undefined, where: string): Agent {
  const s = ua || "";
  const ver = (re: RegExp) => s.match(re)?.[1]?.replace(/_/g, ".") ?? null;
  let device: Agent["device"] = "unknown", os: string | null = null;
  if (/Android/i.test(s)) { device = /Mobile/i.test(s) || where === "app" ? "android" : "tablet"; const v = ver(/Android (\d+(?:\.\d+)?)/); os = v ? `Android ${v}` : "Android"; }
  else if (/iPad/i.test(s)) { device = "tablet"; const v = ver(/OS (\d+[_.]\d+)/); os = v ? `iPadOS ${v}` : "iPadOS"; }
  else if (/iPhone|iPod/i.test(s)) { device = "ios"; const v = ver(/OS (\d+[_.]\d+)/); os = v ? `iOS ${v}` : "iOS"; }
  else if (/Windows/i.test(s)) { device = "desktop"; os = "Windows"; }
  else if (/Macintosh|Mac OS X/i.test(s)) { device = "desktop"; os = "macOS"; }
  else if (/CrOS/i.test(s)) { device = "desktop"; os = "ChromeOS"; }
  else if (/Linux/i.test(s)) { device = "desktop"; os = "Linux"; }
  let browser: string | null = null;
  if (where === "app") browser = "App";
  else if (/Edg\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/SamsungBrowser/.test(s)) browser = "Samsung Internet";
  else if (/Firefox|FxiOS/.test(s)) browser = "Firefox";
  else if (/CriOS|Chrome\//.test(s)) browser = "Chrome";
  else if (/Safari\//.test(s)) browser = "Safari";
  return { device, os, browser };
}

export function placeOf(cf: Record<string, unknown> | undefined | null): Place {
  return { city: clip(cf?.city, 60), region: clip(cf?.region, 60), country: clip(cf?.country, 2) };
}

/** Record one open of the website or the app. */
export async function seen(store: Store, uid: string, body: any, ctx: { ua: string | null; cf?: Record<string, unknown> | null; now: number }) {
  const where = body?.where === "app" ? "app" : "web";
  const at = new Date(ctx.now).toISOString();
  const agent = agentOf(ctx.ua, where), place = placeOf(ctx.cf);
  const version = where === "app" ? clip(body?.version, 20) : null;
  const path = `users/${uid}/activity/recent`;
  const doc = (await store.get(path)) || {};
  const from = new Date(ctx.now - KEEP_MS).toISOString();
  const visits: Record<string, any>[] = (Array.isArray(doc.visits) ? doc.visits : []).filter((v: any) => String(v.last || v.at) >= from);
  const prev = visits[visits.length - 1];
  const same = prev && prev.where === where && prev.device === agent.device && prev.os === agent.os && prev.browser === agent.browser
    && prev.city === place.city && prev.version === version && ctx.now - Date.parse(prev.last || prev.at) < SAME_VISIT_MS;
  if (same) { prev.last = at; prev.pings = (prev.pings || 1) + 1; }
  else visits.push({ at, last: at, pings: 1, where, ...agent, version, ...place });
  const f: Record<string, unknown> = { updated: at, visits: visits.slice(-MAX_VISITS), place, agent: { ...agent, where } };
  if (where === "web") f.lastWeb = at;
  else { f.lastApp = at; f.firstApp = doc.firstApp || at; f.appVersion = version; f.appOs = agent.os; }
  await store.set(path, f);
  return { ok: true };
}
