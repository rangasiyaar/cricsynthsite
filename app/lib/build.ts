// Build-time reads of the published data (public/data, copied in by publish-site before `next build`), so every
// match and result gets a static page of its own. Server only.
import fs from "node:fs";
import path from "node:path";
import { description, facts, faq, jsonLd, title, type Kind } from "./matchText.ts";
import type { MatchDoc, ResultDoc, ResultIndex, VenueIntel } from "./types.ts";

const DATA = path.join(process.cwd(), "public", "data");
const PLACEHOLDER = "_";               // a static export needs one param even with no data (dev, tests)

function read<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8")) as T; } catch { return null; }
}

function ids(dir: string): string[] {
  try {
    return fs.readdirSync(path.join(DATA, dir)).filter((f) => f.endsWith(".json") && !f.endsWith(".pack.json") && f !== "index.json")
      .map((f) => f.slice(0, -5)).sort();
  } catch { return []; }
}

const params = (list: string[]) => (list.length ? list : [PLACEHOLDER]).map((id) => ({ id }));

export const matchIds = () => ids("matches");
export const resultIds = () => ids("results");
export const matchParams = () => params(matchIds());
export const resultParams = () => params(resultIds());

/** A match document the pages can describe, else null (an old or partial document never breaks the build). */
export function readMatch(id: string): MatchDoc | null {
  const d = id === PLACEHOLDER ? null : read<MatchDoc>(`matches/${decodeURIComponent(id)}.json`);
  if (!d) return null;
  try {
    const x = facts(d);
    (["prediction", "fantasy", "xi"] as Kind[]).forEach((k) => [title(x, k), description(x, k), jsonLd(x, k, id, faq(x, k))]);
    return d;
  } catch { return null; }
}

export function readResult(id: string): ResultDoc | null {
  const r = id === PLACEHOLDER ? null : read<ResultDoc>(`results/${decodeURIComponent(id)}.json`);
  return r && Array.isArray(r.teams) && r.teams.length === 2 && r.forecast?.win && Array.isArray(r.items) ? r : null;
}

export const readVenue = (id: string) => (id === PLACEHOLDER ? null : read<VenueIntel>(`venue/${decodeURIComponent(id)}.json`));
export const readResults = () => read<ResultIndex>("results/index.json");

/** Matches still to be played (no result yet): the ones that get a written preview. */
export function upcomingIds(): string[] {
  const done = new Set(resultIds());
  return matchIds().filter((id) => !done.has(id) && readMatch(id));
}
export const previewParams = () => params(upcomingIds());
