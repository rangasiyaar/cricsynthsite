"use client";
// Account dashboard sections: overview, subscription, API keys, profile (used by app/account).
import { deleteUser, signOut, type User } from "firebase/auth";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { auth, usePlan } from "@/lib/firebase";
import {
  API_PLANS, createKey, deleteKey, getProfile, listKeys, renameKey, revokeKey, saveProfile, SLOTS, type ApiKey,
} from "@/lib/keys";

const SECTIONS = ["Overview", "Subscription", "API keys", "Profile"] as const;
export type Section = (typeof SECTIONS)[number];
const API = process.env.NEXT_PUBLIC_API_URL || "https://api.cricsynthesis.in";

const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

function friendly(e: unknown): string {
  const code = (e as { code?: string }).code ?? "";
  if (code === "permission-denied") return "That change isn't allowed. Refresh the page and try again.";
  if (code === "unavailable") return "You appear to be offline. Check your connection and try again.";
  if (code === "auth/requires-recent-login") return "For your security, sign out and sign in again, then delete the account.";
  return (e as Error).message || "Something went wrong. Please try again.";
}

export function Dashboard() {
  const { user, plan, source } = usePlan();
  const [section, setSection] = useState<Section>("Overview");
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const u = user as User;

  const refresh = useCallback(() => {
    listKeys(u.uid).then(setKeys).catch((e) => { setKeys([]); setErr(friendly(e)); });
  }, [u.uid]);
  useEffect(() => {
    refresh();
    const h = window.location.hash.slice(1);
    const match = SECTIONS.find((s) => s.toLowerCase().replace(/\s+/g, "-") === h);
    if (match) setSection(match);
  }, [refresh]);
  const go = (s: Section) => { setSection(s); window.history.replaceState(null, "", `#${s.toLowerCase().replace(/\s+/g, "-")}`); };

  const active = (keys ?? []).filter((k) => !k.revoked).length;
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
      <div className="tabs" role="tablist">
        {SECTIONS.map((s) => <button key={s} role="tab" aria-selected={section === s} onClick={() => go(s)}>{s}</button>)}
      </div>
      {err && <p className="notice" role="alert">{err}</p>}
      {section === "Overview" && <Overview plan={plan} source={source} active={active} go={go} />}
      {section === "Subscription" && <Subscription plan={plan} source={source} />}
      {section === "API keys" && <Keys uid={u.uid} keys={keys} refresh={refresh} setErr={setErr} />}
      {section === "Profile" && <ProfileSection user={u} setErr={setErr} />}
    </>
  );
}

export function Overview({ plan, source, active, go }: { plan?: string; source: string | null; active: number; go: (s: Section) => void }) {
  return (
    <div className="grid g3">
      <div className="card">
        <div className="cs-k">Plan</div>
        <div className="stat dash-stat">{plan === "pro" ? "Pro" : "Free"}</div>
        <p className="small muted">{plan === "pro" && source === "beta" ? "Free during the beta. Includes MatchSynth Lab." : "Forecasts and the match centre."}</p>
        <div className="card-foot"><button type="button" className="btn ghost" onClick={() => go("Subscription")}>Manage plan</button></div>
      </div>
      <div className="card">
        <div className="cs-k">API keys</div>
        <div className="stat dash-stat">{active}<span className="dash-of"> / {SLOTS.length}</span></div>
        <p className="small muted">Active keys on the Free API plan: 200 requests a day.</p>
        <div className="card-foot"><button type="button" className="btn ghost" onClick={() => go("API keys")}>Manage keys</button></div>
      </div>
      <div className="card">
        <div className="cs-k">Shortcuts</div>
        <ul className="dash-links">
          <li><Link href="/lab/">MatchSynth Lab</Link></li>
          <li><Link href="/docs/">API reference</Link></li>
          <li><Link href="/playground/">Playground</Link></li>
          <li><Link href="/mcp/">MCP server</Link></li>
        </ul>
      </div>
    </div>
  );
}

export function Subscription({ plan, source }: { plan?: string; source: string | null }) {
  const pro = plan === "pro";
  const rows: [string, boolean, boolean][] = [
    ["Forecasts for every covered match", true, true], ["Match centre: scores, wickets, players, match-ups", true, true],
    ["Live simulation engine", true, true], ["MatchSynth Lab: conditions, toss, dew", false, true],
    ["Player form and bowler availability", false, true], ["Win probability from any match situation", false, true],
  ];
  return (
    <div className="grid">
      <div className="grid g2">
        <div className="card">
          <div className="card-head"><h3>Current plan</h3><span className="tag pro">{pro ? "Active" : "Free"}</span></div>
          <div className="stat dash-stat">{pro ? "Pro" : "Free"}</div>
          <p className="small">{pro ? source === "beta" ? "Pro is included at no cost for every account during the beta." : "Your Pro subscription is active."
            : "You're on the free plan."}</p>
          <dl className="dash-dl">
            <div><dt>Price</dt><dd>{pro && source === "beta" ? "₹0 during the beta" : "₹0"}</dd></div>
            <div><dt>Renews</dt><dd>{pro && source === "beta" ? "No renewal needed" : "—"}</dd></div>
            <div><dt>Payment method</dt><dd>Not required</dd></div>
          </dl>
          <div className="card-foot" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {pro ? <Link className="btn" href="/lab/">Open MatchSynth Lab</Link> : <Link className="btn" href="/pricing/">Upgrade to Pro</Link>}
            <Link className="btn ghost" href="/pricing/">Compare plans</Link>
          </div>
        </div>
        <div className="card">
          <h3>Billing</h3>
          <p className="small muted">We'll email you well before any paid plan applies to your account, and nothing is charged without
            your confirmation.</p>
          <div className="dash-empty">No invoices yet.</div>
          <div className="card-foot"><Link className="btn ghost" href="/contact/">Questions about billing</Link></div>
        </div>
      </div>
      <div className="card">
        <h3>What's included</h3>
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

export function Keys({ uid, keys, refresh, setErr }: { uid: string; keys: ApiKey[] | null; refresh: () => void; setErr: (s: string | null) => void }) {
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
          <h3>API plan: Free</h3>
          <dl className="dash-dl">
            <div><dt>Requests</dt><dd>{API_PLANS.free.daily.toLocaleString("en-IN")} a day per key</dd></div>
            <div><dt>Simulations</dt><dd>Up to {API_PLANS.free.sims.toLocaleString("en-IN")} per request</dd></div>
            <div><dt>Graphics</dt><dd>Watermarked</dd></div>
          </dl>
          <p className="small muted">Keys switch on when the public API opens; we'll email you. Need higher limits or the Business
            plan? <Link href="/contact/">Talk to our team</Link>.</p>
        </div>
      </div>
      <div className="card">
        <h3>Your keys</h3>
        {keys === null ? <div className="skeleton" style={{ height: 120 }} /> : !keys.length ? (
          <div className="dash-empty">No keys yet. Create one above to get started.</div>
        ) : (
          <div className="table-wrap"><table className="key-table">
            <thead><tr><th>Name</th><th>Key</th><th>Plan</th><th>Created</th><th>Status</th><th className="num">Actions</th></tr></thead>
            <tbody>{keys.map((k) => (
              <tr key={k.slot} className={k.revoked ? "revoked" : undefined}>
                <td>{editing === k.slot ? (
                  <form onSubmit={(e) => { e.preventDefault(); run(() => renameKey(uid, k.slot, draft)); setEditing(null); }} className="key-rename">
                    <input className="form-input" value={draft} maxLength={40} autoFocus onChange={(e) => setDraft(e.target.value)} aria-label="New name" />
                    <button className="linkbtn" type="submit">Save</button>
                  </form>) : k.name}</td>
                <td><code>{k.prefix}…</code></td>
                <td>{API_PLANS[k.plan]?.label ?? k.plan}</td>
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

export function ProfileSection({ user, setErr }: { user: User; setErr: (s: string | null) => void }) {
  const [company, setCompany] = useState("");
  const [useCase, setUseCase] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { getProfile(user.uid).then((p) => { setCompany(p.company ?? ""); setUseCase(p.useCase ?? ""); }).catch(() => {}); }, [user.uid]);
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
        <h3>Session</h3>
        <p className="small muted">Signed in on this device.</p>
        <button type="button" className="btn ghost" style={{ alignSelf: "flex-start" }} onClick={() => signOut(auth()).then(() => window.location.replace("/"))}>Sign out</button>
        <h3 style={{ marginTop: 28 }}>Delete account</h3>
        <p className="small muted">Removes your account and sign-in. API keys you created stop working.</p>
        <div className="card-foot"><button type="button" className="btn ghost danger-btn" onClick={remove}>Delete account</button></div>
      </div>
    </div>
  );
}
