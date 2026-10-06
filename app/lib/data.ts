// Where published data comes from. Today: static JSON next to the app (public/data, filled by
// `cricsim.publish`). Later: Firestore documents with the same shapes.
import type { Pack } from "./engine/sim.ts";
import type { MatchDoc, MatchIndex, PatternReport } from "./types.ts";

const BASE = process.env.NEXT_PUBLIC_DATA_URL || "/data";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}/${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} loading ${path}`);
  return (await r.json()) as T;
}

export const loadIndex = () => get<MatchIndex>("index.json");
export const loadMatch = (id: string) => get<MatchDoc>(`matches/${encodeURIComponent(id)}.json`);
export const loadPack = (id: string) => get<Pack>(`matches/${encodeURIComponent(id)}.pack.json`);
export const loadPatterns = () => get<PatternReport>("patterns.json");
