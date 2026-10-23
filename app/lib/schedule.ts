// When a fixture starts and whether it is upcoming, under way or over. Fixture times are IST.
import type { MatchCard } from "./types.ts";

// Generous lengths, so a match counts as live until it has surely ended.
const HOURS: Record<string, number> = { T10: 2, T20: 4, HUNDRED: 3.5, OD: 9, MULTIDAY: 120 };

export type Status = "upcoming" | "live" | "finished";

export function kickoffMs(date?: string | null, time?: string | null): number | null {
  if (!date) return null;
  const t = time && /^\d\d:\d\d/.test(time) ? time.slice(0, 5) : "23:59";
  const ms = Date.parse(`${date}T${t}:00+05:30`);
  return Number.isNaN(ms) ? null : ms;
}

export function status(m: Pick<MatchCard, "date" | "start_time" | "format">, now: number): Status {
  const k = kickoffMs(m.date, m.start_time);
  if (k === null || now < k) return "upcoming";
  return now < k + (HOURS[m.format] ?? 8) * 3_600_000 ? "live" : "finished";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2d 04h" more than a day out, else "02:14:37"; null once the time has passed. */
export function countdown(ms: number | null, now: number): string | null {
  if (ms === null) return null;
  const s = Math.floor((ms - now) / 1000);
  if (s <= 0) return null;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${pad(h)}h` : `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

/** "23 Oct · 2:00 PM" in IST. */
export function startLabel(date?: string | null, time?: string | null): string {
  const k = kickoffMs(date, time);
  if (k === null) return date ?? "";
  const opts: Intl.DateTimeFormatOptions = { timeZone: "Asia/Kolkata", day: "numeric", month: "short" };
  const day = new Intl.DateTimeFormat("en-IN", opts).format(k);
  if (!time) return day;
  const at = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(k);
  return `${day} · ${at.toUpperCase()}`;
}
