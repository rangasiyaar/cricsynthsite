// Traffic (Cloudflare GraphQL analytics: Web Analytics for page views, zone requests, Worker requests), pipeline
// health and app downloads (GitHub), and forecast accuracy / data checks (the site's own /data). Each part fails on
// its own: the page shows what it got plus the reason a part is missing.
import { type Env, site } from "./env.ts";

type Row = Record<string, any>;
const CF = "https://api.cloudflare.com/client/v4";

async function cf(env: Env, path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${CF}${path}`, { ...init, headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" } });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false || j.errors?.length) throw new Error(`cloudflare ${r.status}: ${JSON.stringify(j.errors || j).slice(0, 160)}`);
  return j;
}
const gql = async (env: Env, query: string, variables: Row) => (await cf(env, "/graphql", { method: "POST", body: JSON.stringify({ query, variables }) })).data;

async function part<T>(errors: string[], name: string, f: () => Promise<T>): Promise<T | null> {
  try { return await f(); } catch (e) { errors.push(`${name}: ${String((e as Error).message || e).slice(0, 200)}`); return null; }
}

export async function traffic(env: Env, now = new Date()) {
  const errors: string[] = [];
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return { errors: ["Cloudflare isn't connected (CF_API_TOKEN / CF_ACCOUNT_ID)"] };
  const host = env.SITE_HOST || "cricsynthesis.in";
  const acct = env.CF_ACCOUNT_ID;
  const until = now.toISOString(), since30 = new Date(now.getTime() - 30 * 86400_000);
  const d30 = since30.toISOString().slice(0, 10);
  const since7 = new Date(now.getTime() - 7 * 86400_000).toISOString();

  // Web Analytics (cookieless page views): the site tag for our host
  const rum = await part(errors, "Web Analytics", async () => {
    const sites = (await cf(env, `/accounts/${acct}/rum/site_info/list?per_page=50`)).result || [];
    const s = sites.find((x: Row) => x.host === host || x.ruleset?.zone_name === host) || sites[0];
    if (!s) throw new Error("not turned on for the site yet");
    const f = { siteTag: s.site_tag, datetime_geq: since30.toISOString(), datetime_leq: until };
    const f7 = { siteTag: s.site_tag, datetime_geq: since7, datetime_leq: until };
    const top = (dim: string) => `rumPageloadEventsAdaptiveGroups(limit: 12, filter: $f7, orderBy: [count_DESC]) { count dimensions { ${dim} } }`;
    const d = await gql(env, `query($acct: String!, $f: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject, $f7: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject) {
      viewer { accounts(filter: { accountTag: $acct }) {
        days: rumPageloadEventsAdaptiveGroups(limit: 40, filter: $f, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
        pages: ${top("requestPath")}
        countries: ${top("countryName")}
        referrers: ${top("refererHost")}
        devices: ${top("deviceType")}
      } } }`, { acct, f, f7 });
    const a = d?.viewer?.accounts?.[0] || {};
    const pick = (rows: Row[] = [], dim: string) => rows.map((r) => ({ name: r.dimensions?.[dim] || "(none)", views: r.count }));
    return { days: (a.days || []).map((r: Row) => ({ day: r.dimensions.date, views: r.count, visits: r.sum?.visits ?? null })),
             pages: pick(a.pages, "requestPath"), countries: pick(a.countries, "countryName"),
             referrers: pick(a.referrers, "refererHost"), devices: pick(a.devices, "deviceType") };
  });

  // zone requests per day (every request to cricsynthesis.in, including the data files and bots)
  const zone = await part(errors, "Zone requests", async () => {
    const z = (await cf(env, `/zones?name=${encodeURIComponent(host)}`)).result?.[0];
    if (!z) throw new Error(`zone ${host} not found`);
    const d = await gql(env, `query($zone: String!, $d: Date!) { viewer { zones(filter: { zoneTag: $zone }) {
      httpRequests1dGroups(limit: 40, filter: { date_geq: $d }, orderBy: [date_ASC]) {
        dimensions { date } sum { requests bytes cachedRequests pageViews threats } uniq { uniques } } } } }`, { zone: z.id, d: d30 });
    return (d?.viewer?.zones?.[0]?.httpRequests1dGroups || []).map((r: Row) => ({ day: r.dimensions.date, requests: r.sum.requests,
      cached: r.sum.cachedRequests, bytes: r.sum.bytes, pageViews: r.sum.pageViews, threats: r.sum.threats, uniques: r.uniq?.uniques ?? null }));
  });

  // Worker requests per day per script (the free plan's 100,000 requests a day is account-wide)
  const workers = await part(errors, "Worker requests", async () => {
    const d = await gql(env, `query($acct: String!, $d: Date!) { viewer { accounts(filter: { accountTag: $acct }) {
      workersInvocationsAdaptive(limit: 400, filter: { date_geq: $d }, orderBy: [date_ASC]) {
        dimensions { date scriptName } sum { requests errors subrequests } } } } }`, { acct, d: d30 });
    return (d?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || []).map((r: Row) => ({ day: r.dimensions.date,
      script: r.dimensions.scriptName, requests: r.sum.requests, errors: r.sum.errors }));
  });

  return { built: now.toISOString(), host, rum, zone, workers, errors };
}

// ── GitHub ──
const WORKFLOWS = [
  ["publish-site.yml", "Nightly publish"], ["live.yml", "Live updates"], ["auto.yml", "Auto loop"],
  ["edge-data.yml", "API data"], ["deploy-worker.yml", "API Worker deploy"], ["deploy-master.yml", "Console deploy"],
  ["android.yml", "Android build"], ["data-freshness.yml", "Data freshness"], ["site-check.yml", "Site check"],
];

async function gh(env: Env, path: string): Promise<any> {
  const r = await fetch(`https://api.github.com/repos/${env.GH_REPO || "rangasiyaar/cricsynthsite"}${path}`, { headers: {
    Accept: "application/vnd.github+json", "User-Agent": "cricsynthesis-console", "X-GitHub-Api-Version": "2022-11-28",
    ...(env.GH_TOKEN ? { Authorization: `Bearer ${env.GH_TOKEN}` } : {}) } });
  if (!r.ok) throw new Error(`github ${r.status}${r.status === 404 || r.status === 401 ? " (add the GH_TOKEN secret)" : ""}`);
  return r.json();
}

export async function health(env: Env, now = new Date()) {
  const errors: string[] = [];
  const branch = env.GH_BRANCH || "claude/cricsynthesis-platform";
  const runs = await part(errors, "GitHub Actions", async () => Promise.all(WORKFLOWS.map(async ([file, label]) => {
    const d = await gh(env, `/actions/workflows/${file}/runs?per_page=10&branch=${encodeURIComponent(branch)}`).catch((e) => ({ error: String(e.message) }));
    const rs: Row[] = d.workflow_runs || [];
    const done = rs.filter((r) => r.status === "completed");
    return { file, label, error: d.error || null, last: rs[0] ? { status: rs[0].status, conclusion: rs[0].conclusion, at: rs[0].created_at, url: rs[0].html_url } : null,
             lastSuccess: done.find((r) => r.conclusion === "success")?.created_at || null,
             failures: done.filter((r) => r.conclusion === "failure").length, of: done.length };
  })));
  const releases = await part(errors, "App releases", async () => ((await gh(env, "/releases?per_page=15")) as Row[])
    .filter((r) => !r.draft).map((r) => ({ tag: r.tag_name, name: r.name, at: r.published_at,
      downloads: (r.assets || []).reduce((s: number, x: Row) => s + (x.download_count || 0), 0),
      apk: (r.assets || []).filter((x: Row) => String(x.name).endsWith(".apk")).reduce((s: number, x: Row) => s + (x.download_count || 0), 0) })));

  const base = site(env);
  const get = async (p: string) => { const r = await fetch(`${base}${p}`, { cf: { cacheTtl: 120 } } as RequestInit); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json() as Promise<any>; };
  const data = await part(errors, "Site data", async () => {
    const idx = await get("/data/index.json");
    const today = now.toISOString().slice(0, 10);
    const ms: Row[] = idx.matches || [];
    const upcoming = ms.filter((m) => (m.date || "") >= today);
    return { generated: idx.generated_at || null, matches: ms.length, upcoming: upcoming.length,
             missingXi: upcoming.filter((m) => !m.xis).map((m) => ({ id: m.id, title: m.title, date: m.date, start: m.start_time || null, status: m.status || null })),
             live: ms.filter((m) => m.status === "started").length };
  });
  const build = await part(errors, "Site build", () => get("/data/build.json"));
  const app = await part(errors, "App version", () => get("/download/app.json"));
  return { built: now.toISOString(), runs, releases, data, build, app, errors,
           limits: { pagesFiles: 20_000, workerRequestsPerDay: 100_000, firestoreReadsPerDay: 50_000, firestoreWritesPerDay: 20_000 } };
}

// ── forecast accuracy (the published results index) ──
export const formatOf = (id: string) => {
  const m = /-(t20|t10|hundred|odi|od|test|multiday)-/i.exec(id);
  const f = m ? m[1].toUpperCase() : "OTHER";
  return f === "ODI" ? "OD" : f === "TEST" ? "MULTIDAY" : f;
};

export function accuracyFrom(idx: Row) {
  const ms: Row[] = (idx.matches || []).filter((m: Row) => m.checks);
  const agg = (rows: Row[]) => {
    const fav = rows.filter((m) => m.favourite_won != null);
    const br = rows.filter((m) => m.brier != null);
    const fan = rows.filter((m) => m.fantasy?.single != null);
    const hits = rows.reduce((s, m) => s + (m.hits || 0), 0), checks = rows.reduce((s, m) => s + (m.checks || 0), 0);
    return { matches: rows.length, hits, checks, accuracy: checks ? hits / checks : null,
             favourite: fav.length ? fav.filter((m) => m.favourite_won).length / fav.length : null, favouriteOf: fav.length,
             brier: br.length ? br.reduce((s, m) => s + m.brier, 0) / br.length : null,
             fantasy: fan.length ? fan.reduce((s, m) => s + m.fantasy.single, 0) / fan.length : null };
  };
  const by = (f: (m: Row) => string) => {
    const g: Record<string, Row[]> = {};
    for (const m of ms) (g[f(m)] ||= []).push(m);
    return Object.entries(g).map(([k, rows]) => ({ key: k, ...agg(rows) })).sort((a, b) => b.matches - a.matches);
  };
  const tabs = Object.entries<Row>(idx.tabs || {}).map(([tab, t]) => ({ tab, hits: t.hits, checks: t.checks, accuracy: t.checks ? t.hits / t.checks : null }));
  const months = by((m) => String(m.date || "").slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key));
  return { generated: idx.generated_at || null, overall: agg(ms), formats: by((m) => formatOf(m.id)), competitions: by((m) => m.competition || "Other").slice(0, 25),
           months, tabs, recent: ms.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 25)
             .map((m) => ({ id: m.id, title: m.title, date: m.date, accuracy: m.accuracy, brier: m.brier, favourite_won: m.favourite_won, result: m.result })) };
}

export async function accuracy(env: Env) {
  const r = await fetch(`${site(env)}/data/results/index.json`, { cf: { cacheTtl: 300 } } as RequestInit);
  if (!r.ok) throw new Error(`results index ${r.status}`);
  return accuracyFrom(await r.json());
}
