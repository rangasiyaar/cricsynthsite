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

  // browsers and operating systems (7 days), separate so an unsupported field can't break the main query
  const agents = await part(errors, "Browsers", async () => {
    const sites = (await cf(env, `/accounts/${acct}/rum/site_info/list?per_page=50`)).result || [];
    const s = sites.find((x: Row) => x.host === host || x.ruleset?.zone_name === host) || sites[0];
    if (!s) throw new Error("Web Analytics not turned on");
    const f7 = { siteTag: s.site_tag, datetime_geq: since7, datetime_leq: until };
    const top = (dim: string) => `rumPageloadEventsAdaptiveGroups(limit: 8, filter: $f7, orderBy: [count_DESC]) { count dimensions { ${dim} } }`;
    const d = await gql(env, `query($acct: String!, $f7: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject) {
      viewer { accounts(filter: { accountTag: $acct }) { browsers: ${top("userAgentBrowser")} os: ${top("userAgentOS")} } } }`, { acct, f7 });
    const a = d?.viewer?.accounts?.[0] || {};
    const pick = (rows: Row[] = [], dim: string) => rows.map((r) => ({ name: r.dimensions?.[dim] || "(none)", views: r.count }));
    return { browsers: pick(a.browsers, "userAgentBrowser"), os: pick(a.os, "userAgentOS") };
  });

  // Core Web Vitals from the same beacon (p75 per page and device; Google's thresholds in the UI)
  const vitals = await part(errors, "Core Web Vitals", async () => {
    const sites = (await cf(env, `/accounts/${acct}/rum/site_info/list?per_page=50`)).result || [];
    const s = sites.find((x: Row) => x.host === host || x.ruleset?.zone_name === host) || sites[0];
    if (!s) throw new Error("Web Analytics not turned on");
    const f7 = { siteTag: s.site_tag, datetime_geq: since7, datetime_leq: until };
    const q = "quantiles { largestContentfulPaintP75 interactionToNextPaintP75 cumulativeLayoutShiftP75 firstContentfulPaintP75 timeToFirstByteP75 }";
    const sums = "sum { lcpGood lcpNeedsImprovement lcpPoor inpGood inpNeedsImprovement inpPoor clsGood clsNeedsImprovement clsPoor }";
    const d = await gql(env, `query($acct: String!, $f: AccountRumWebVitalsEventsAdaptiveGroupsFilter_InputObject) {
      viewer { accounts(filter: { accountTag: $acct }) {
        all: rumWebVitalsEventsAdaptiveGroups(limit: 1, filter: $f) { count ${q} ${sums} }
        pages: rumWebVitalsEventsAdaptiveGroups(limit: 15, filter: $f, orderBy: [count_DESC]) { count ${q} dimensions { requestPath } }
        devices: rumWebVitalsEventsAdaptiveGroups(limit: 5, filter: $f, orderBy: [count_DESC]) { count ${q} dimensions { deviceType } }
      } } }`, { acct, f: f7 });
    const a = d?.viewer?.accounts?.[0] || {};
    const p75 = (r: Row) => ({ samples: r.count, lcp: r.quantiles?.largestContentfulPaintP75 ?? null, inp: r.quantiles?.interactionToNextPaintP75 ?? null,
      cls: r.quantiles?.cumulativeLayoutShiftP75 ?? null, fcp: r.quantiles?.firstContentfulPaintP75 ?? null, ttfb: r.quantiles?.timeToFirstByteP75 ?? null });
    const all = a.all?.[0];
    return { overall: all ? { ...p75(all), sum: all.sum || {} } : null,
             pages: (a.pages || []).map((r: Row) => ({ name: r.dimensions.requestPath, ...p75(r) })),
             devices: (a.devices || []).map((r: Row) => ({ name: r.dimensions.deviceType, ...p75(r) })) };
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

  return { built: now.toISOString(), host, rum, agents, vitals, zone, workers, errors };
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

// ── Google Analytics 4 (website visitors who accepted analytics cookies) ──
export const FUNNEL = [["page_view", "Visited"], ["match_view", "Opened a match"], ["sign_up", "Signed up"], ["api_key_created", "Created an API key"]];

type GaRow = { dims: string[]; mets: number[] };
const rows = (r: any): GaRow[] => (r?.rows || []).map((x: any) => ({
  dims: (x.dimensionValues || []).map((d: any) => d.value), mets: (x.metricValues || []).map((m: any) => Number(m.value)) }));

/** Week totals (this week and the one before) and the extra breakdowns on the Product page. */
export const GA_TOTALS = ["activeUsers", "newUsers", "sessions", "engagedSessions", "engagementRate", "averageSessionDuration", "screenPageViews", "eventCount"];
export function gaMore(totals: any, landing: any, channels: any, cities: any, os: any, pageTime: any) {
  const keys = ["users", "newUsers", "sessions", "engaged", "engagementRate", "avgSession", "views", "events"];
  const week = (name: string) => {
    const r = rows(totals).find((x) => x.dims[0] === name) || (name === "cur" && rows(totals).length === 1 ? rows(totals)[0] : null);
    return r ? Object.fromEntries(keys.map((k, i) => [k, r.mets[i] ?? null])) : null;
  };
  const pair = (r: any) => rows(r).map((x) => ({ name: x.dims[0] || "(none)", value: x.mets[0] }));
  return {
    week: totals ? { cur: week("cur"), prev: week("prev") } : null,
    landing: rows(landing).map((x) => ({ name: x.dims[0] || "(none)", sessions: x.mets[0], engagement: x.mets[1] })),
    channels: pair(channels), cities: pair(cities), os: pair(os),
    pageTime: rows(pageTime).map((x) => ({ name: x.dims[0] || "(none)", views: x.mets[0], users: x.mets[1],
      secs: x.mets[1] ? x.mets[2] / x.mets[1] : null })),
  };
}

export function gaShape(daily: any, events: any, pages: any, sources: any, countries: any, devices: any, nvr: any, live: any) {
  const ev = rows(events).map((r) => ({ name: r.dims[0], count: r.mets[0], users: r.mets[1] }));
  const users = (n: string) => ev.find((e) => e.name === n)?.users ?? 0;
  const pair = (r: any, k = 1) => rows(r).map((x) => ({ name: x.dims.slice(0, k).join(" / ") || "(none)", value: x.mets[0] }));
  return {
    daily: rows(daily).map((r) => ({ day: `${r.dims[0].slice(0, 4)}-${r.dims[0].slice(4, 6)}-${r.dims[0].slice(6, 8)}`,
      users: r.mets[0], newUsers: r.mets[1], sessions: r.mets[2], views: r.mets[3], engaged: r.mets[4] })).sort((a, b) => a.day.localeCompare(b.day)),
    events: ev,
    funnel: FUNNEL.map(([name, label]) => ({ name, label, users: users(name) })),
    pages: pair(pages), sources: pair(sources, 2), countries: pair(countries), devices: pair(devices),
    newVsReturning: pair(nvr),
    realtime: rows(live)[0]?.mets[0] ?? 0,
  };
}

export async function analytics(env: Env, google: { ga: (p: string, m: "runReport" | "runRealtimeReport", b: Row) => Promise<any> }) {
  if (!env.GA_PROPERTY) return { errors: ["Google Analytics isn't connected yet (GA_PROPERTY)"] };
  const p = env.GA_PROPERTY, d30 = [{ startDate: "29daysAgo", endDate: "today" }], d7 = [{ startDate: "6daysAgo", endDate: "today" }];
  const report = (dims: string[], mets: string[], dateRanges = d7, limit = 12, order = mets[0]) => google.ga(p, "runReport", {
    dateRanges, dimensions: dims.map((name) => ({ name })), metrics: mets.map((name) => ({ name })), limit,
    ...(dims[0] === "date" ? {} : { orderBys: [{ metric: { metricName: order }, desc: true }] }) });
  const errors: string[] = [];
  const get = (name: string, f: () => Promise<any>) => f().catch((e) => { errors.push(`${name}: ${String(e.message || e).slice(0, 200)}`); return null; });
  const [daily, events, pages, sources, countries, devices, nvr, live] = await Promise.all([
    get("Daily", () => report(["date"], ["activeUsers", "newUsers", "sessions", "screenPageViews", "engagedSessions"], d30, 40)),
    get("Events", () => report(["eventName"], ["eventCount", "totalUsers"], d30, 50)),
    get("Pages", () => report(["pagePath"], ["screenPageViews"], d7, 15)),
    get("Sources", () => report(["sessionSource", "sessionMedium"], ["sessions"], d7, 12)),
    get("Countries", () => report(["country"], ["activeUsers"], d7, 12)),
    get("Devices", () => report(["deviceCategory"], ["activeUsers"], d7, 5)),
    get("New vs returning", () => report(["newVsReturning"], ["activeUsers"], d30, 5)),
    get("Realtime", () => google.ga(p, "runRealtimeReport", { metrics: [{ name: "activeUsers" }] })),
  ]);
  const wk = [{ startDate: "6daysAgo", endDate: "today", name: "cur" }, { startDate: "13daysAgo", endDate: "7daysAgo", name: "prev" }];
  const [totals, landing, channels, cities, os, pageTime] = await Promise.all([
    get("Totals", () => google.ga(p, "runReport", { dateRanges: wk, metrics: GA_TOTALS.map((name) => ({ name })) })),
    get("Landing pages", () => report(["landingPage"], ["sessions", "engagementRate"], d7, 12)),
    get("Channels", () => report(["sessionDefaultChannelGroup"], ["sessions"], d7, 10)),
    get("Cities", () => report(["city"], ["activeUsers"], d7, 12)),
    get("Operating systems", () => report(["operatingSystem"], ["activeUsers"], d7, 8)),
    get("Time on page", () => report(["pagePath"], ["screenPageViews", "activeUsers", "userEngagementDuration"], d7, 15)),
  ]);
  return { built: new Date().toISOString(), property: p, ...gaShape(daily, events, pages, sources, countries, devices, nvr, live),
           ...gaMore(totals, landing, channels, cities, os, pageTime), errors };
}

// ── Microsoft Clarity (data export: last 1–3 days, 10 calls a day per project) ──
// One overall call and one by page, cached in Firestore for 6 hours (≤ 8 calls a day).
export const CLARITY_TTL_MS = 6 * 3600_000;
export async function clarityFetch(env: Env, dims = ""): Promise<any[]> {
  const r = await fetch(`https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=3${dims}`,
    { headers: { Authorization: `Bearer ${env.CLARITY_TOKEN}`, "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(`clarity ${r.status}${r.status === 429 ? " (daily export limit reached; try later)" : ""}`);
  return r.json() as Promise<any[]>;
}

/** Clarity's metrics as {name, rows}: each row is a flat record (sessions, pages, percentages, URL…). */
export function clarityShape(overall: any[] | null, byUrl: any[] | null) {
  const flat = (m: any) => ({ name: String(m.metricName || ""), rows: (m.information || []) as Record<string, any>[] });
  const o = (overall || []).map(flat), u = (byUrl || []).map(flat);
  const pick = (list: typeof o, name: string) => list.find((m) => m.name.toLowerCase() === name.toLowerCase())?.rows || [];
  const num = (v: any) => (v == null || v === "" ? null : Number(v));
  const traffic = pick(o, "Traffic")[0] || {};
  const pageRows = (metric: string, key = "sessionsCount") => pick(u, metric).map((r) => ({ url: r.Url || r.URL || r.url || "(unknown)",
    value: num(r[key] ?? r.subTotal ?? r.sessionsWithMetricPercentage ?? r.sessionsCount) })).filter((r) => r.value)
    .sort((a, b) => (b.value as number) - (a.value as number)).slice(0, 12);
  const summary = Object.fromEntries(o.map((m) => [m.name, m.rows[0] || {}]));
  return { sessions: num(traffic.totalSessionCount ?? traffic.sessionsCount), bots: num(traffic.totalBotSessionCount),
           users: num(traffic.distinctUserCount), pagesPerSession: num(traffic.pagesPerSessionPercentage),
           summary, rage: pageRows("RageClickCount"), dead: pageRows("DeadClickCount"), quickback: pageRows("QuickbackClick"),
           scriptErrors: pageRows("ScriptErrorCount"), scroll: pageRows("ScrollDepth", "averageScrollDepth"), traffic: pageRows("Traffic", "totalSessionCount") };
}

// ── Google Search Console (search clicks, impressions, queries, pages; data lags 2–3 days) ──
type ScRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };
export function scShape(daily: any, queries: any, pages: any, countries: any, devices: any, sitemaps: any) {
  const r = (x: any): ScRow[] => x?.rows || [];
  const row = (x: ScRow) => ({ key: x.keys?.[0] ?? "", clicks: x.clicks, impressions: x.impressions, ctr: x.ctr, position: x.position });
  const d = r(daily).map((x) => ({ day: x.keys?.[0] ?? "", clicks: x.clicks, impressions: x.impressions, ctr: x.ctr, position: x.position }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const tot = (rows: typeof d) => {
    const c = rows.reduce((s, x) => s + x.clicks, 0), i = rows.reduce((s, x) => s + x.impressions, 0);
    return { clicks: c, impressions: i, ctr: i ? c / i : null,
             position: i ? rows.reduce((s, x) => s + x.position * x.impressions, 0) / i : null };
  };
  return { daily: d, last7: tot(d.slice(-7)), prev7: tot(d.slice(-14, -7)), total: tot(d),
           queries: r(queries).map(row), pages: r(pages).map(row), countries: r(countries).map(row), devices: r(devices).map(row),
           sitemaps: (sitemaps?.sitemap || []).map((s: any) => ({ path: s.path, lastSubmitted: s.lastSubmitted || null, lastDownloaded: s.lastDownloaded || null,
             pending: Boolean(s.isPending), errors: Number(s.errors || 0), warnings: Number(s.warnings || 0),
             submitted: (s.contents || []).reduce((n: number, c: any) => n + Number(c.submitted || 0), 0) })) };
}

export async function search(env: Env, google: { sc: (site: string, path: string, body?: Row) => Promise<any> }, now = new Date()) {
  const site = env.SC_SITE || "sc-domain:cricsynthesis.in";
  const day = (n: number) => new Date(now.getTime() - n * 86400_000).toISOString().slice(0, 10);
  const q = (dimensions: string[], rowLimit: number, from = 27, to = 0) =>
    google.sc(site, "/searchAnalytics/query", { startDate: day(from), endDate: day(to), dimensions, rowLimit, dataState: "all" });
  const errors: string[] = [];
  const get = (name: string, f: () => Promise<any>) => f().catch((e) => { errors.push(`${name}: ${String(e.message || e).slice(0, 200)}`); return null; });
  const [daily, queries, pages, countries, devices, sitemaps] = await Promise.all([
    get("Daily", () => q(["date"], 60, 34)), get("Queries", () => q(["query"], 50)), get("Pages", () => q(["page"], 50)),
    get("Countries", () => q(["country"], 12)), get("Devices", () => q(["device"], 5)), get("Sitemaps", () => google.sc(site, "/sitemaps"))]);
  // the 28 days before, to show what moved
  const [qPrev, pPrev] = await Promise.all([get("Queries before", () => q(["query"], 100, 55, 28)), get("Pages before", () => q(["page"], 100, 55, 28))]);
  const prev = (x: any) => (x?.rows || []).map((r: ScRow) => ({ key: r.keys?.[0] ?? "", clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
  return { built: now.toISOString(), site, ...scShape(daily, queries, pages, countries, devices, sitemaps), queriesPrev: prev(qPrev), pagesPrev: prev(pPrev), errors };
}

// ── free-tier meters: today's use against each free limit (Firestore via Cloud Monitoring; Workers via Cloudflare) ──
export const FREE = { firestoreReads: 50_000, firestoreWrites: 20_000, firestoreDeletes: 20_000, workerRequests: 100_000, pagesFiles: 20_000 };
export async function meters(env: Env, google: { dailySum: (m: string, d: number) => Promise<{ day: string; value: number }[]> }, now = new Date()) {
  const errors: string[] = [];
  const get = async <T>(name: string, f: () => Promise<T>) => { try { return await f(); } catch (e) {
    const m = String((e as Error).message || e);
    errors.push(`${name}: ${m.includes(" 403") ? "grant api-worker the Monitoring Viewer role" : m.slice(0, 160)}`); return null; } };
  const [reads, writes, deletes] = await Promise.all([
    get("Firestore reads", () => google.dailySum("firestore.googleapis.com/document/read_ops_count", 14)),
    get("Firestore writes", () => google.dailySum("firestore.googleapis.com/document/write_ops_count", 14)),
    get("Firestore deletes", () => google.dailySum("firestore.googleapis.com/document/delete_ops_count", 14))]);
  let workers: { day: string; value: number }[] | null = null;
  if (env.CF_API_TOKEN && env.CF_ACCOUNT_ID) workers = await get("Worker requests", async () => {
    const d = await gql(env, `query($acct: String!, $d: Date!) { viewer { accounts(filter: { accountTag: $acct }) {
      workersInvocationsAdaptive(limit: 500, filter: { date_geq: $d }) { dimensions { date } sum { requests } } } } }`,
      { acct: env.CF_ACCOUNT_ID, d: new Date(now.getTime() - 13 * 86400_000).toISOString().slice(0, 10) });
    const by: Record<string, number> = {};
    for (const r of d?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || []) by[r.dimensions.date] = (by[r.dimensions.date] || 0) + r.sum.requests;
    return Object.entries(by).map(([day, value]) => ({ day, value })).sort((a, b) => a.day.localeCompare(b.day));
  });
  const today = now.toISOString().slice(0, 10);
  const row = (label: string, series: { day: string; value: number }[] | null, limit: number, note: string) => {
    const t = series?.find((x) => x.day === today)?.value ?? (series ? 0 : null);
    const peak = series?.length ? Math.max(...series.map((x) => x.value)) : null;
    return { label, today: t, peak14: peak, limit, share: t == null ? null : t / limit, note, series: series || [] };
  };
  return { built: now.toISOString(), errors, meters: [
    row("Firestore reads", reads, FREE.firestoreReads, "per day, resets at midnight Pacific"),
    row("Firestore writes", writes, FREE.firestoreWrites, "per day"),
    row("Firestore deletes", deletes, FREE.firestoreDeletes, "per day"),
    row("Worker requests (all Workers)", workers, FREE.workerRequests, "per day, UTC; over it requests fail, never billed"),
  ] };
}

// ── Bing Webmaster Tools (clicks, impressions, top queries and pages; Bing's index also feeds ChatGPT search) ──
const bingDate = (v: string) => { const m = /\/Date\((\d+)/.exec(String(v)); return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : String(v).slice(0, 10); };
export function bingShape(traffic: any, queries: any, pages: any) {
  const d = (x: any) => (x?.d || []) as Row[];
  const daily = d(traffic).map((r) => ({ day: bingDate(r.Date), clicks: Number(r.Clicks || 0), impressions: Number(r.Impressions || 0) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const row = (r: Row) => ({ key: r.Query, clicks: Number(r.Clicks || 0), impressions: Number(r.Impressions || 0),
    ctr: Number(r.Impressions) ? Number(r.Clicks || 0) / Number(r.Impressions) : null, position: r.AvgImpressionPosition ?? r.AvgClickPosition ?? null });
  const sum = (rows: typeof daily, k: "clicks" | "impressions") => rows.reduce((s, x) => s + x[k], 0);
  return { daily, last7: { clicks: sum(daily.slice(-7), "clicks"), impressions: sum(daily.slice(-7), "impressions") },
           total: { clicks: sum(daily, "clicks"), impressions: sum(daily, "impressions") },
           queries: d(queries).map(row).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 50),
           pages: d(pages).map(row).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 50) };
}
export async function bing(env: Env) {
  if (!env.BING_API_KEY) return { errors: ["Bing isn't connected yet (add the BING_API_KEY secret)"] };
  const site = encodeURIComponent(`https://${env.SITE_HOST || "cricsynthesis.in"}/`);
  const call = async (m: string) => {
    const r = await fetch(`https://ssl.bing.com/webmaster/api.svc/json/${m}?siteUrl=${site}&apikey=${encodeURIComponent(env.BING_API_KEY!)}`);
    if (!r.ok) throw new Error(`bing ${m} ${r.status}`);
    return r.json();
  };
  const errors: string[] = [];
  const get = (m: string) => call(m).catch((e) => { errors.push(String(e.message)); return null; });
  const [t, q, p] = await Promise.all([get("GetRankAndTrafficStats"), get("GetQueryStats"), get("GetPageStats")]);
  return { built: new Date().toISOString(), ...bingShape(t, q, p), errors };
}
