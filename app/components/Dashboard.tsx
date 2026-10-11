"use client";
// Account dashboard sections: overview, usage, API keys, subscription (plan, upgrades, billing), profile (app/account).
import { deleteUser, signOut, type User } from "firebase/auth";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChartFrame, type Column } from "@/components/charts";
import { SHEET } from "@/components/RequestAccess";
import { auth, usePlan } from "@/lib/firebase";
import {
  API_PLANS, cancelRequest, CATEGORIES, createKey, dayKey, deleteKey, emptyUsage, getProfile, listKeys, listRequests, listUsage,
  renameKey, requestUpgrade, revokeKey, saveNotify, saveProfile, SLOTS, VOLUMES,
  type ApiKey, type Notify, type Upgrade, type UpgradeRequest, type UsageDay,
} from "@/lib/keys";

const SECTIONS = ["Overview", "Usage", "API keys", "Subscription", "Profile"] as const;
export type Section = (typeof SECTIONS)[number];
const ico = (d: string) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ICONS: Record<string, React.ReactNode> = {
  Overview: ico("M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"),
  Usage: ico("M4 20V10M10 20V4M16 20v-7M22 20H2"),
  Subscription: ico("M3 7h18v10H3zM3 11h18M7 15h3"),
  "API keys": ico("M14 7a4 4 0 1 1-3.9 5H3v3h3v2h3v-2h1.1A4 4 0 0 1 14 7zm1.5 2.5h.01"),
  Profile: ico("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0"),
};
const SHORT: Record<string, string> = { Overview: "Overview", Usage: "Usage", Subscription: "Plan", "API keys": "Keys", Profile: "Profile" };
const API = process.env.NEXT_PUBLIC_API_URL || "https://api.cricsynthesis.in";

const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtN = (n: number) => n.toLocaleString("en-IN");
const fmtDay = (day: string, long = false) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN",
  long ? { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });
function ago(d: Date | null): string {
  if (!d) return "Never";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return fmtDate(d);
}
const PLAN_ORDER = ["free", "pro", "business"];
/** The account's API plan: the highest plan on any active key (upgrades are applied to keys by our team). */
const apiPlanOf = (keys: ApiKey[]) =>
  keys.filter((k) => !k.revoked).reduce((best, k) => (PLAN_ORDER.indexOf(k.plan) > PLAN_ORDER.indexOf(best) ? k.plan : best), "free");

function Meter({ frac, label }: { frac: number; label: string }) {
  const f = Math.min(Math.max(frac, 0), 1);
  return (
    <div className={`meter${f >= 0.9 ? " hot" : f >= 0.8 ? " warm" : ""}`} role="meter" aria-label={label}
         aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(100 * f)}>
      <i style={{ width: `${100 * f}%` }} />
    </div>
  );
}

function friendly(e: unknown): string {
  const code = (e as { code?: string }).code ?? "";
  if (code === "permission-denied") return "That change isn't allowed. Refresh the page and try again.";
  if (code === "unavailable") return "You appear to be offline. Check your connection and try again.";
  if (code === "auth/requires-recent-login") return "For your security, sign out and sign in again, then delete the account.";
  return (e as Error).message || "Something went wrong. Please try again.";
}

export function Dashboard() {
  const { user, plan, source } = usePlan();
  // usePlan starts as "still checking" on first render, even inside RequireSignIn; wait for the account.
  if (!user || plan === undefined) return <div className="skeleton card" style={{ minHeight: 280 }} aria-busy="true" />;
  return <DashboardFor user={user} plan={plan} source={source} />;
}

function DashboardFor({ user, plan, source }: { user: User; plan: string; source: string | null }) {
  const [section, setSection] = useState<Section>("Overview");
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [usage, setUsage] = useState<UsageDay[] | null>(null);
  const [requests, setRequests] = useState<UpgradeRequest[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const u = user;

  const refresh = useCallback(() => {
    listKeys(u.uid).then(setKeys).catch((e) => { setKeys([]); setErr(friendly(e)); });
  }, [u.uid]);
  const refreshRequests = useCallback(() => {
    listRequests(u.uid).then(setRequests).catch(() => setRequests([]));
  }, [u.uid]);
  useEffect(() => {
    refresh();
    refreshRequests();
    listUsage(u.uid, 30).then(setUsage).catch(() => setUsage(emptyUsage(30)));
    const h = window.location.hash.slice(1);
    const match = SECTIONS.find((s) => s.toLowerCase().replace(/\s+/g, "-") === h);
    if (match) setSection(match);
  }, [refresh, refreshRequests, u.uid]);
  const go = (s: Section) => { setSection(s); window.history.replaceState(null, "", `#${s.toLowerCase().replace(/\s+/g, "-")}`); };

  const active = (keys ?? []).filter((k) => !k.revoked).length;
  const apiPlan = apiPlanOf(keys ?? []);
  const today = usage?.[usage.length - 1];
  const limit = API_PLANS[apiPlan].daily;
  // the daily limit is per key: the busiest key decides how close the account is to being throttled
  const busiest = today ? Math.max(0, ...Object.values(today.keys)) : 0;
  return (
    <>
      <div className="dash-head">
        <div>
          <p className="cs-eyebrow">Dashboard</p>
          <h1 className="dash-title">{u.displayName ? `Hi, ${u.displayName.split(" ")[0]}` : "Your account"}</h1>
          <p className="muted small" style={{ margin: 0 }}>{u.email}</p>
        </div>
        <span className="tag pro dash-plan">{plan === "pro" ? `Pro${source === "beta" ? " · beta" : ""}` : "Free"}</span>
      </div>
      <div className="dash-layout">
        <nav className="dash-side" aria-label="Dashboard">
          {SECTIONS.map((s) => (
            <button key={s} type="button" aria-current={section === s ? "page" : undefined} onClick={() => go(s)}>
              <span className="dash-ico" aria-hidden="true">{ICONS[s]}</span><span className="dash-label">{s}</span><span className="dash-label-short">{SHORT[s]}</span>
            </button>
          ))}
        </nav>
        <h2 className="dash-section-title">{section}</h2>
        <div className="dash-main">
          {err && <p className="notice" role="alert">{err}</p>}
          {busiest >= 0.8 * limit && (section === "Overview" || section === "Usage") && (
            <p className="notice dash-alert" role="status">
              A key has used {fmtN(busiest)} of its {fmtN(limit)} requests today. Requests over the limit return HTTP 429 until
              {" "}05:30 IST. <button type="button" className="linkbtn" onClick={() => go("Subscription")}>Raise your limit</button>
            </p>
          )}
          {section === "Overview" && <Overview plan={plan} source={source} keys={keys} usage={usage} apiPlan={apiPlan} go={go} />}
          {section === "Usage" && <Usage keys={keys} usage={usage} apiPlan={apiPlan} go={go} />}
          {section === "Subscription" && <Subscription uid={u.uid} plan={plan} source={source} apiPlan={apiPlan} requests={requests}
                                                       refresh={refreshRequests} setErr={setErr} user={u} />}
          {section === "API keys" && <Keys uid={u.uid} keys={keys} usage={usage} refresh={refresh} setErr={setErr} />}
          {section === "Profile" && <ProfileSection user={u} setErr={setErr} />}
        </div>
      </div>
    </>
  );
}

export function Overview({ plan, source, keys, usage, apiPlan, go }: {
  plan?: string; source: string | null; keys: ApiKey[] | null; usage: UsageDay[] | null; apiPlan: string; go: (s: Section) => void;
}) {
  const active = (keys ?? []).filter((k) => !k.revoked).length;
  const last14 = usage?.slice(-14) ?? null;
  const today = usage?.[usage.length - 1]?.total ?? 0;
  const month = (usage ?? []).reduce((t, d) => t + d.total, 0);
  const steps: [string, boolean, React.ReactNode][] = [
    ["Create an API key", (keys ?? []).length > 0, <button key="k" type="button" className="linkbtn" onClick={() => go("API keys")}>Create a key</button>],
    ["Make your first request", month > 0, <Link key="d" href="/docs/">Read the API reference</Link>],
    ["Try MatchSynth Lab", false, <Link key="l" href="/lab/">Open the Lab</Link>],
    ["Connect the MCP server", false, <Link key="m" href="/mcp/">Set it up</Link>],
  ];
  return (
    <div className="grid">
      <div className="grid dash-stats">
        <div className="card">
          <div className="cs-k">Plan</div>
          <div className="stat dash-stat">{plan === "pro" ? "Pro" : "Free"}</div>
          <p className="small muted">{plan === "pro" && source === "beta" ? "Free during the beta, MatchSynth Lab included." : "Forecasts and the match centre."}</p>
          <div className="card-foot"><button type="button" className="btn ghost" onClick={() => go("Subscription")}>Manage plan</button></div>
        </div>
        <div className="card">
          <div className="cs-k">Requests today</div>
          <div className="stat dash-stat">{usage ? fmtN(today) : "—"}</div>
          <p className="small muted">{fmtN(month)} in the last 30 days.</p>
          <div className="card-foot"><button type="button" className="btn ghost" onClick={() => go("Usage")}>View usage</button></div>
        </div>
        <div className="card">
          <div className="cs-k">API keys</div>
          <div className="stat dash-stat">{keys ? active : "—"}<span className="dash-of"> / {SLOTS.length}</span></div>
          <p className="small muted">{API_PLANS[apiPlan].label} API plan: {fmtN(API_PLANS[apiPlan].daily)} requests a day per key.</p>
          <div className="card-foot"><button type="button" className="btn ghost" onClick={() => go("API keys")}>Manage keys</button></div>
        </div>
      </div>
      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h3>Last 14 days</h3><span className="small muted">API requests a day</span></div>
          {last14 ? <UsageChart days={last14} compact /> : <div className="skeleton" style={{ height: 150 }} />}
          <div className="card-foot"><button type="button" className="linkbtn" onClick={() => go("Usage")}>Full usage report →</button></div>
        </div>
        <div className="card">
          <h3>Get started</h3>
          <ol className="dash-steps">
            {steps.map(([t, done, cta]) => (
              <li key={t} className={done ? "done" : undefined}>
                <span className="dash-check" aria-hidden="true">{done ? "✓" : ""}</span>
                <span>{t}{done && <span className="sr-only"> (done)</span>}</span>{!done && <span className="small">{cta}</span>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

/** Requests per day as bars; hover a day for its breakdown by endpoint category. */
function UsageChart({ days, compact = false }: { days: UsageDay[]; compact?: boolean }) {
  const W = compact ? 560 : 1000, H = compact ? 150 : 220, pad = { l: 44, r: 8, t: 10, b: 26 };
  const max = Math.max(10, ...days.map((d) => d.total));
  const nice = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / nice) * nice;
  const bw = (W - pad.l - pad.r) / days.length;
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const cols: Column[] = days.map((d, i) => ({
    x0: pad.l + i * bw, x1: pad.l + (i + 1) * bw, title: fmtDay(d.day, true),
    rows: [{ label: "Requests", value: fmtN(d.total) },
           ...CATEGORIES.filter(([k]) => d.cats[k]).map(([k, l]) => ({ label: l, value: fmtN(d.cats[k]) }))],
  }));
  const every = Math.ceil(days.length / (compact ? 5 : 8));
  return (
    <ChartFrame W={W} H={H} top={pad.t} bottom={H - pad.b} columns={cols} label="API requests per day">
      <g className="grid">{[0, 0.5, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={y(f * top)} y2={y(f * top)} />)}</g>
      {[0, 0.5, 1].map((f) => <text key={f} x={pad.l - 6} y={y(f * top) + 4} textAnchor="end">{fmtN(f * top)}</text>)}
      {days.map((d, i) => d.total > 0 && (
        <rect key={d.day} x={pad.l + i * bw + bw * 0.18} width={bw * 0.64} y={y(d.total)} height={y(0) - y(d.total)}
              rx={2} fill="var(--cs-steel)" />
      ))}
      {days.map((d, i) => (i % every === (days.length - 1) % every) && (
        <text key={`t${d.day}`} x={pad.l + (i + 0.5) * bw} y={H - 8} textAnchor="middle">{fmtDay(d.day)}</text>
      ))}
    </ChartFrame>
  );
}

export function Usage({ keys, usage, apiPlan, go }: { keys: ApiKey[] | null; usage: UsageDay[] | null; apiPlan: string; go: (s: Section) => void }) {
  const [span, setSpan] = useState<7 | 30>(30);
  if (!usage || !keys) return <div className="skeleton card" style={{ minHeight: 280 }} aria-busy="true" />;
  const days = usage.slice(-span);
  const total = days.reduce((t, d) => t + d.total, 0);
  const today = usage[usage.length - 1];
  const limit = API_PLANS[apiPlan].daily;
  const peak = days.reduce((b, d) => (d.total > b.total ? d : b), days[0]);
  const byKey = (slot: string, ds: UsageDay[]) => ds.reduce((t, d) => t + (d.keys[slot] ?? 0), 0);
  const cats = CATEGORIES.map(([k, l]) => [l, days.reduce((t, d) => t + (d.cats[k] ?? 0), 0)] as [string, number]);
  const catMax = Math.max(1, ...cats.map(([, n]) => n));
  return (
    <div className="grid">
      <div className="dash-toolbar">
        <div className="seg" role="group" aria-label="Period">
          {([7, 30] as const).map((n) => <button key={n} type="button" aria-pressed={span === n} onClick={() => setSpan(n)}>Last {n} days</button>)}
        </div>
        <span className="small muted">Updated about every minute · days in UTC</span>
      </div>
      <div className="grid dash-stats">
        <div className="card"><div className="cs-k">Requests</div><div className="stat dash-stat">{fmtN(total)}</div>
          <p className="small muted">In the last {span} days, across all keys.</p></div>
        <div className="card"><div className="cs-k">Today</div><div className="stat dash-stat">{fmtN(today.total)}</div>
          <p className="small muted">Limit {fmtN(limit)} a day per key on the {API_PLANS[apiPlan].label} plan.</p></div>
        <div className="card"><div className="cs-k">Busiest day</div><div className="stat dash-stat">{peak.total ? fmtN(peak.total) : "—"}</div>
          <p className="small muted">{peak.total ? fmtDay(peak.day, true) : "No requests yet."}</p></div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Requests per day</h3><span className="small muted">Hover a day for the breakdown</span></div>
        <UsageChart days={days} />
        {total === 0 && (
          <div className="dash-empty">No API requests in this period. Create a key, then call any endpoint with the
            {" "}<code>X-API-Key</code> header; requests show up here within a minute.</div>
        )}
      </div>
      <div className="grid g2">
        <div className="card">
          <h3>By key</h3>
          {!keys.length ? <div className="dash-empty">No keys yet.</div> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Key</th><th className="num">Today</th><th className="num">{span} days</th></tr></thead>
              <tbody>{keys.map((k) => {
                const t = today.keys[k.slot] ?? 0, cap = API_PLANS[k.plan]?.daily ?? limit;
                return (
                  <tr key={k.slot} className={k.revoked ? "revoked" : undefined}>
                    <td><div>{k.name}</div><code className="small muted">{k.prefix}…</code>
                      {!k.revoked && <Meter frac={t / cap} label={`${k.name}: ${t} of ${cap} today`} />}</td>
                    <td className="num">{fmtN(t)}<div className="small muted">of {fmtN(cap)}</div></td>
                    <td className="num">{fmtN(byKey(k.slot, days))}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
        </div>
        <div className="card">
          <h3>By endpoint category</h3>
          <div className="dash-cats">
            {cats.map(([l, n]) => (
              <div key={l}>
                <div className="dash-cat-head"><span>{l}</span><b>{fmtN(n)}</b></div>
                <div className="meter"><i style={{ width: `${(100 * n) / catMax}%` }} /></div>
              </div>
            ))}
          </div>
          <dl className="dash-dl" style={{ marginTop: "auto" }}>
            <div><dt>Daily limits reset</dt><dd>05:30 IST (00:00 UTC)</dd></div>
            <div><dt>Over the limit</dt><dd>HTTP 429</dd></div>
          </dl>
          <div className="card-foot"><button type="button" className="btn ghost" onClick={() => go("Subscription")}>Need higher limits?</button></div>
        </div>
      </div>
    </div>
  );
}

const API_TIERS: { id: string; upgrade?: Upgrade; price: string; points: string[] }[] = [
  { id: "free", price: "₹0", points: ["200 requests a day per key", "Up to 2,000 simulations a request", "Watermarked graphics"] },
  { id: "pro", upgrade: "api-pro", price: "Custom", points: ["5,000 requests a day per key", "Up to 20,000 simulations a request", "Clean graphics"] },
  { id: "business", upgrade: "api-business", price: "Custom", points: ["50,000 requests a day per key", "Up to 50,000 simulations a request", "Priority support"] },
];
const STATUS: Record<string, string> = { pending: "Under review", approved: "Approved", declined: "Not approved", cancelled: "Cancelled" };

export function Subscription({ uid, plan, source, apiPlan, requests, refresh, setErr, user }: {
  uid: string; plan?: string; source: string | null; apiPlan: string; requests: UpgradeRequest[] | null;
  refresh: () => void; setErr: (s: string | null) => void; user: User;
}) {
  const pro = plan === "pro";
  const [asking, setAsking] = useState<Upgrade | null>(null);
  const [volume, setVolume] = useState(VOLUMES[1][0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const reqOf = (u?: Upgrade) => requests?.find((r) => r.plan === u);
  const rows: [string, boolean, boolean][] = [
    ["Forecasts for every covered match", true, true], ["Match centre: scores, wickets, players, match-ups", true, true],
    ["Live simulation engine", true, true], ["MatchSynth Lab: conditions, toss, dew", false, true],
    ["Player form and bowler availability", false, true], ["Win probability from any match situation", false, true],
  ];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asking) return;
    setBusy(true); setErr(null);
    try {
      await requestUpgrade(uid, asking, volume, note);
      // let the team know straight away (same inbox as the contact form)
      fetch(SHEET, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name: user.displayName ?? "", email: user.email ?? "", interest: `Upgrade: ${asking}`, volume, message: note,
        source: "dashboard" }) }).catch(() => {});
      setAsking(null); setNote(""); refresh();
    } catch (x) { setErr(friendly(x)); } finally { setBusy(false); }
  };
  const cancel = async (u: Upgrade) => {
    setErr(null);
    try { await cancelRequest(uid, u); refresh(); } catch (x) { setErr(friendly(x)); }
  };
  return (
    <div className="grid">
      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h3>Website plan</h3><span className="tag pro">{pro ? "Active" : "Free"}</span></div>
          <div className="stat dash-stat">{pro ? "Pro" : "Free"}</div>
          <p className="small">{pro ? source === "beta" ? "Pro is included at no cost for every account during the beta." : "Your Pro subscription is active."
            : "You're on the free plan."}</p>
          <dl className="dash-dl">
            <div><dt>Price</dt><dd>{pro && source === "beta" ? "₹0 during the beta" : "₹0"}</dd></div>
            <div><dt>Renews</dt><dd>{pro && source === "beta" ? "No renewal needed" : "—"}</dd></div>
          </dl>
          <div className="card-foot" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {pro ? <Link className="btn" href="/lab/">Open MatchSynth Lab</Link> : <Link className="btn" href="/pricing/">Upgrade to Pro</Link>}
            <Link className="btn ghost" href="/pricing/">Compare plans</Link>
          </div>
        </div>
        <div className="card">
          <h3>Billing</h3>
          <dl className="dash-dl">
            <div><dt>Payment method</dt><dd>None needed</dd></div>
            <div><dt>Next invoice</dt><dd>—</dd></div>
            <div><dt>Billing email</dt><dd>{user.email}</dd></div>
          </dl>
          <p className="small muted">Paid API plans are set up with our team: we confirm the price by email first, and nothing is
            charged without your written go-ahead.</p>
          <div className="dash-empty">No invoices yet.</div>
          <div className="card-foot"><Link className="btn ghost" href="/contact/">Billing questions</Link></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>API plan</h3><span className="small muted">Limits apply per key</span></div>
        <div className="grid g3 dash-tiers">
          {API_TIERS.map((t) => {
            const current = t.id === apiPlan;
            const lower = PLAN_ORDER.indexOf(t.id) < PLAN_ORDER.indexOf(apiPlan);
            const r = reqOf(t.upgrade);
            return (
              <div key={t.id} className={`dash-tier${current ? " current" : ""}`}>
                <div className="card-head"><b>{API_PLANS[t.id].label}</b>{current && <span className="tag pro">Current</span>}</div>
                <div className="dash-tier-price">{t.price}</div>
                <ul>{t.points.map((p) => <li key={p}>{p}</li>)}</ul>
                <div className="dash-tier-foot">
                  {current || lower || !t.upgrade ? <span className="small muted">{current ? "Your plan" : "Included"}</span>
                    : r?.status === "pending" ? (
                      <><span className="dash-status pending">{STATUS.pending}</span>
                        <button type="button" className="linkbtn" onClick={() => cancel(t.upgrade!)}>Cancel request</button></>
                    ) : r?.status === "approved" ? <span className="dash-status ok">{STATUS.approved}: applied to your keys shortly</span>
                    : (
                      <>{r && <span className={`dash-status ${r.status}`}>{STATUS[r.status]}</span>}
                        <button type="button" className="btn" onClick={() => { setAsking(t.upgrade!); setErr(null); }}>
                          {r ? "Request again" : "Request upgrade"}</button></>
                    )}
                </div>
              </div>
            );
          })}
        </div>
        {asking && (
          <form className="dash-upgrade" onSubmit={submit}>
            <h3>Upgrade to {asking === "api-pro" ? "Pro" : "Business"}</h3>
            <p className="small muted">Tell us roughly how much you'll use. We reply within one working day with pricing; the new
              limits go live on your existing keys once you confirm.</p>
            <label className="form-label" htmlFor="volume">Expected requests</label>
            <select id="volume" className="form-input" value={volume} onChange={(e) => setVolume(e.target.value)}>
              {VOLUMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label className="form-label" htmlFor="note">What are you building? (optional)</label>
            <textarea id="note" className="form-input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" className="btn" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
              <button type="button" className="btn ghost" onClick={() => setAsking(null)}>Cancel</button>
            </div>
          </form>
        )}
        {!!requests?.length && (
          <div className="table-wrap" style={{ marginTop: 20 }}><table>
            <thead><tr><th>Request</th><th>Volume</th><th>Sent</th><th>Status</th></tr></thead>
            <tbody>{requests.map((r) => (
              <tr key={r.plan}><td>{r.plan === "api-pro" ? "API Pro" : "API Business"}</td>
                <td>{VOLUMES.find(([v]) => v === r.volume)?.[1] ?? r.volume}</td><td>{fmtDate(r.created)}</td>
                <td><span className={`dash-status ${r.status}`}>{STATUS[r.status] ?? r.status}</span></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      <div className="card">
        <h3>What's included on the website</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>Feature</th><th className="num">Free</th><th className="num">Pro</th></tr></thead>
          <tbody>{rows.map(([f, a, b]) => (
            <tr key={f}><td>{f}</td><td className="num">{a ? "✓" : "—"}</td><td className="num">{b ? "✓" : "—"}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
    </div>
  );
}

export function Keys({ uid, keys, usage, refresh, setErr }: {
  uid: string; keys: ApiKey[] | null; usage: UsageDay[] | null; refresh: () => void; setErr: (s: string | null) => void;
}) {
  const todayKeys = usage?.[usage.length - 1]?.day === dayKey(new Date()) ? usage[usage.length - 1].keys : {};
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const used = (keys ?? []).map((k) => k.slot);
  const full = used.length >= SLOTS.length;

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await f(); refresh(); } catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  };
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => { const key = await createKey(uid, name, used); setFresh({ key, name: name || "Untitled key" }); setName(""); setCopied(false); });
  };
  const copy = async () => { if (fresh) { await navigator.clipboard.writeText(fresh.key); setCopied(true); } };

  return (
    <div className="grid">
      {fresh && (
        <div className="card key-reveal" role="status">
          <h3>Your new key: {fresh.name}</h3>
          <p className="small">Copy it now. For your security it won't be shown again; only its fingerprint is stored.</p>
          <div className="key-box"><code>{fresh.key}</code>
            <button type="button" className="btn" onClick={copy}>{copied ? "Copied" : "Copy"}</button></div>
          <div className="cs-api" style={{ padding: 0, marginTop: 14 }}><div className="cs-api-panel">
            <div className="cs-api-panel-head"><span>Quick start</span><span>curl</span></div>
            <pre className="req">{`curl ${API}/v1/matches \\\n  -H "X-API-Key: ${fresh.key}"`}</pre></div></div>
          <div className="card-foot" style={{ marginTop: 14 }}><button type="button" className="btn ghost" onClick={() => setFresh(null)}>I've saved it</button></div>
        </div>
      )}
      <div className="grid g2">
        <div className="card">
          <h3>Create a key</h3>
          <p className="small muted">Name it after where it'll be used, such as "Production" or "Fantasy app". You can have up to
            {" "}{SLOTS.length} keys.</p>
          <form onSubmit={create} className="key-form">
            <input className="form-input" placeholder="Key name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} aria-label="Key name" />
            <button type="submit" className="btn" disabled={busy || full}>{full ? "Limit reached" : "Create key"}</button>
          </form>
        </div>
        <div className="card">
          <h3>Using your key</h3>
          <dl className="dash-dl">
            <div><dt>Header</dt><dd><code>X-API-Key: cs_live_…</code></dd></div>
            <div><dt>Base URL</dt><dd><code>{API}/v1</code></dd></div>
            <div><dt>Limits</dt><dd>Per key, reset 05:30 IST</dd></div>
          </dl>
          <p className="small muted">Keep keys on your server, never in an app or web page. If a key leaks, revoke it and create a
            new one. Higher limits are on the <Link href="/account/#subscription">Subscription</Link> tab.</p>
        </div>
      </div>
      <div className="card">
        <h3>Your keys</h3>
        {keys === null ? <div className="skeleton" style={{ height: 120 }} /> : !keys.length ? (
          <div className="dash-empty">No keys yet. Create one above to get started.</div>
        ) : (
          <div className="table-wrap"><table className="key-table">
            <thead><tr><th>Name</th><th>Key</th><th>Plan</th><th className="num">Today</th><th>Last used</th><th>Created</th><th>Status</th><th className="num">Actions</th></tr></thead>
            <tbody>{keys.map((k) => (
              <tr key={k.slot} className={k.revoked ? "revoked" : undefined}>
                <td>{editing === k.slot ? (
                  <form onSubmit={(e) => { e.preventDefault(); run(() => renameKey(uid, k.slot, draft)); setEditing(null); }} className="key-rename">
                    <input className="form-input" value={draft} maxLength={40} autoFocus onChange={(e) => setDraft(e.target.value)} aria-label="New name" />
                    <button className="linkbtn" type="submit">Save</button>
                  </form>) : k.name}</td>
                <td><code>{k.prefix}…</code></td>
                <td>{API_PLANS[k.plan]?.label ?? k.plan}</td>
                <td className="num">{fmtN(todayKeys[k.slot] ?? 0)}</td>
                <td>{ago(k.lastUsed)}</td>
                <td>{fmtDate(k.created)}</td>
                <td>{k.revoked ? <span className="muted">Revoked</span> : <span className="key-live">Active</span>}</td>
                <td className="num key-actions">
                  {!k.revoked && editing !== k.slot && <button className="linkbtn" onClick={() => { setEditing(k.slot); setDraft(k.name); }}>Rename</button>}
                  {!k.revoked && <button className="linkbtn danger" disabled={busy}
                    onClick={() => confirm(`Revoke "${k.name}"? Apps using it will stop working.`) && run(() => revokeKey(uid, k.slot))}>Revoke</button>}
                  {k.revoked && <button className="linkbtn" disabled={busy} onClick={() => run(() => deleteKey(uid, k.slot))}>Delete</button>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

const NOTIFY: [keyof Notify, string, string][] = [
  ["notifyUsage", "Usage alerts", "When a key keeps reaching its daily limit."],
  ["notifyBilling", "Plan and billing", "Upgrade requests, pricing and invoices."],
  ["notifyProduct", "Product updates", "New endpoints, competitions and features. A few times a year."],
];

export function ProfileSection({ user, setErr }: { user: User; setErr: (s: string | null) => void }) {
  const [company, setCompany] = useState("");
  const [useCase, setUseCase] = useState("");
  const [saved, setSaved] = useState(false);
  const [notify, setNotify] = useState<Notify>({ notifyUsage: true, notifyBilling: true, notifyProduct: false });
  useEffect(() => {
    getProfile(user.uid).then((p) => {
      setCompany(p.company ?? ""); setUseCase(p.useCase ?? "");
      setNotify((n) => ({ notifyUsage: p.notifyUsage ?? n.notifyUsage, notifyBilling: p.notifyBilling ?? n.notifyBilling,
                          notifyProduct: p.notifyProduct ?? n.notifyProduct }));
    }).catch(() => {});
  }, [user.uid]);
  const toggle = (k: keyof Notify) => {
    const next = { ...notify, [k]: !notify[k] };
    setNotify(next); setErr(null);
    saveNotify(user.uid, next).catch((x) => { setNotify(notify); setErr(friendly(x)); });
  };
  const providers = user.providerData.map((p) => (p.providerId === "google.com" ? "Google" : p.providerId === "password" ? "Email and password" : p.providerId));
  const save = (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setSaved(false);
    saveProfile(user.uid, { company, useCase }).then(() => setSaved(true)).catch((x) => setErr(friendly(x)));
  };
  const remove = async () => {
    if (!confirm("Delete your account? Your API keys stop working and this can't be undone.")) return;
    try { await deleteUser(user); window.location.replace("/"); } catch (x) { setErr(friendly(x)); }
  };
  return (
    <div className="grid">
      <div className="grid g2">
        <div className="card">
          <h3>Profile</h3>
          <dl className="dash-dl">
            <div><dt>Name</dt><dd>{user.displayName || "—"}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Sign-in</dt><dd>{providers.join(", ") || "—"}</dd></div>
            <div><dt>Member since</dt><dd>{user.metadata.creationTime ? fmtDate(new Date(user.metadata.creationTime)) : "—"}</dd></div>
          </dl>
          <form onSubmit={save} className="dash-form">
            <label className="form-label" htmlFor="company">Company or team</label>
            <input id="company" className="form-input" maxLength={80} value={company} onChange={(e) => setCompany(e.target.value)} />
            <label className="form-label" htmlFor="usecase">What are you building?</label>
            <textarea id="usecase" className="form-input" rows={3} maxLength={280} value={useCase} onChange={(e) => setUseCase(e.target.value)} />
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button type="submit" className="btn">Save</button>{saved && <span className="small muted">Saved</span>}
            </div>
          </form>
        </div>
        <div className="card">
          <h3>Email notifications</h3>
          <p className="small muted">Sent to {user.email}. Changes save straight away.</p>
          <div className="dash-toggles">
            {NOTIFY.map(([k, t, d]) => (
              <label key={k} className="dash-toggle">
                <input type="checkbox" checked={!!notify[k]} onChange={() => toggle(k)} />
                <span><b>{t}</b><span className="small muted">{d}</span></span>
              </label>
            ))}
          </div>
          <h3 style={{ marginTop: 24 }}>Session</h3>
          <p className="small muted">Signed in on this device.</p>
          <div className="card-foot"><button type="button" className="btn ghost" onClick={() => signOut(auth()).then(() => window.location.replace("/"))}>Sign out</button></div>
        </div>
      </div>
      <div className="card dash-danger">
        <div>
          <h3>Delete account</h3>
          <p className="small muted" style={{ margin: 0 }}>Removes your account and sign-in. API keys you created stop working.</p>
        </div>
        <button type="button" className="btn ghost danger-btn" onClick={remove}>Delete account</button>
      </div>
    </div>
  );
}
