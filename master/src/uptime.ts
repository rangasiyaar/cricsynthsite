// Uptime: every 5 minutes (the console Worker's cron) we request the public site, its data, the API and the MCP
// server, and append one line per check to Firestore adminUptime/{UTC day}: "HH:MM|code:ms|code:ms|…" in TARGETS
// order (one write per check, no read). The Health page reads the last 7 days.
export const TARGETS = [
  { key: "site", label: "Website", url: "https://cricsynthesis.in/", expect: "text/html" },
  { key: "data", label: "Forecast data", url: "https://cricsynthesis.in/data/index.json", expect: "json" },
  { key: "api", label: "API", url: "https://api.cricsynthesis.in/health", expect: "json" },
  { key: "mcp", label: "MCP server", url: "https://mcp.cricsynthesis.in/.well-known/oauth-protected-resource", expect: "json" },
] as const;
const TIMEOUT_MS = 10_000;

export async function probe(url: string, expect: string, fetcher: typeof fetch = (i, o) => fetch(i, o)): Promise<{ code: number; ms: number }> {
  const t0 = Date.now();
  try {
    const r = await fetcher(url, { headers: { "User-Agent": "cricsynthesis-uptime", "Cache-Control": "no-cache" },
                                   signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
    const ct = r.headers.get("Content-Type") || "";
    await r.arrayBuffer();
    const ok = r.ok && ct.includes(expect === "json" ? "json" : expect);
    return { code: ok ? r.status : r.ok ? 299 : r.status, ms: Date.now() - t0 };     // 299 = answered, wrong content
  } catch {
    return { code: 0, ms: Date.now() - t0 };                                          // 0 = no answer / timeout
  }
}

export async function check(now = new Date(), fetcher?: typeof fetch): Promise<string> {
  const res = await Promise.all(TARGETS.map((t) => probe(t.url, t.expect, fetcher)));
  return `${now.toISOString().slice(11, 16)}|${res.map((r) => `${r.code}:${r.ms}`).join("|")}`;
}

type Line = { day: string; t: string; res: { code: number; ms: number }[] };
export function parse(day: string, line: string): Line | null {
  const [t, ...rest] = line.split("|");
  if (!t || rest.length !== TARGETS.length) return null;
  return { day, t, res: rest.map((x) => { const [c, m] = x.split(":"); return { code: Number(c), ms: Number(m) }; }) };
}
const up = (code: number) => code >= 200 && code < 299;

/** Per target: current state, uptime over 24 h / 7 d, p50 / p95 latency (24 h), incidents, and a 24-hour strip. */
export function summarize(days: { day: string; checks: string[] }[], now = new Date()) {
  const lines = days.flatMap((d) => d.checks.map((c) => parse(d.day, c)).filter((x): x is Line => Boolean(x)))
    .sort((a, b) => `${a.day}${a.t}`.localeCompare(`${b.day}${b.t}`));
  const at = (l: Line) => Date.parse(`${l.day}T${l.t}:00Z`);
  const since24 = now.getTime() - 86400_000;
  const pct = (xs: Line[], i: number) => (xs.length ? xs.filter((l) => up(l.res[i].code)).length / xs.length : null);
  const q = (xs: number[], p: number) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const last24 = lines.filter((l) => at(l) >= since24);
  return {
    checks: lines.length, last: lines.at(-1) ? `${lines.at(-1)!.day}T${lines.at(-1)!.t}:00Z` : null,
    targets: TARGETS.map((t, i) => {
      const incidents: { from: string; to: string | null; checks: number; code: number }[] = [];
      for (const l of lines) {
        const ts = `${l.day}T${l.t}:00Z`, c = l.res[i].code, open = incidents.at(-1);
        if (!up(c)) { if (open && open.to === null) open.checks++; else incidents.push({ from: ts, to: null, checks: 1, code: c }); }
        else if (open && open.to === null) open.to = ts;
      }
      const lastLine = lines.at(-1);
      return { key: t.key, label: t.label, url: t.url,
               now: lastLine ? { up: up(lastLine.res[i].code), code: lastLine.res[i].code, ms: lastLine.res[i].ms } : null,
               uptime24: pct(last24, i), uptime7: pct(lines, i),
               p50: q(last24.filter((l) => up(l.res[i].code)).map((l) => l.res[i].ms), 0.5),
               p95: q(last24.filter((l) => up(l.res[i].code)).map((l) => l.res[i].ms), 0.95),
               incidents: incidents.slice(-10).reverse(),
               strip: last24.map((l) => (up(l.res[i].code) ? 1 : 0)) };
    }),
  };
}
