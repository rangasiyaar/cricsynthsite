// Where published data comes from. Today: static JSON next to the app (public/data, filled by
// `cricsim.publish`). Later: Firestore documents with the same shapes.
//
// In the Android app (and its screens under /m/) every file that loads is also kept on the phone (Cache Storage):
// screens open straight away from the last copy (`peek…`) while the network copy loads, and still open offline.
import type { Pack } from "./engine/sim.ts";
import type { MatchDoc, MatchIndex, ResultDoc, ResultIndex } from "./types.ts";

const BASE = process.env.NEXT_PUBLIC_DATA_URL || "/data";
const CACHE = "cs-data-v1";

const keeps = () => typeof window !== "undefined" && "caches" in window
  && (!!(window as { Capacitor?: unknown }).Capacitor || window.location.pathname.startsWith("/m/"));
const url = (path: string) => `${BASE}/${path}`;

async function store(path: string, r: Response) {
  if (!keeps()) return;
  try { await (await caches.open(CACHE)).put(url(path), r); } catch { /* storage full or blocked: just not kept */ }
}

/** The copy kept on this device, if any. */
async function peek<T>(path: string): Promise<T | null> {
  if (!keeps()) return null;
  try {
    const r = await (await caches.open(CACHE)).match(url(path));
    return r ? ((await r.json()) as T) : null;
  } catch { return null; }
}

/** The network copy (kept for next time); with `offline`, the kept copy when the network fails. */
async function get<T>(path: string, offline = false): Promise<T> {
  try {
    const r = await fetch(url(path), { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} loading ${path}`);
    store(path, r.clone());
    return (await r.json()) as T;
  } catch (e) {
    const kept = offline ? await peek<T>(path) : null;
    if (kept) return kept;
    throw e;
  }
}

const matchPath = (id: string) => `matches/${encodeURIComponent(id)}.json`;

export const loadIndex = () => get<MatchIndex>("index.json");
export const loadMatch = (id: string) => get<MatchDoc>(matchPath(id));
export const loadPack = (id: string) => get<Pack>(`matches/${encodeURIComponent(id)}.pack.json`, true);
export const loadResults = () => get<ResultIndex>("results/index.json");
export const loadResult = (id: string) => get<ResultDoc>(`results/${encodeURIComponent(id)}.json`);

export const peekIndex = () => peek<MatchIndex>("index.json");
export const peekMatch = (id: string) => peek<MatchDoc>(matchPath(id));
export const peekResults = () => peek<ResultIndex>("results/index.json");
