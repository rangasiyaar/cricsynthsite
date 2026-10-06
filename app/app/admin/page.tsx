"use client";
// Admin: decide which matches are covered, pick the XIs, publish the simulations.
// Talks to the API's /admin routes with the admin key (kept in this browser only).
import { useEffect, useState } from "react";

const DEFAULT_API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
type Player = { id: string; name: string; hand?: string; bowling_kind?: string };
type Team = { name: string; short?: string; players: Player[] };
type Coverage = { id: string; title?: string; date?: string; format: string; gender: string; competition?: string;
                  venue?: string; venue_id?: string; comp_key?: string; teams: { name: string; short?: string; players: string[] }[] };

const blankTeam = (): Team => ({ name: "", players: [] });

export default function Admin() {
  const [api, setApi] = useState(DEFAULT_API);
  const [key, setKey] = useState("");
  const [list, setList] = useState<Coverage[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ id: "", title: "", date: "", start_time: "", format: "T20", gender: "male",
                                     competition: "", comp_key: "", venue: "", venue_id: "" });
  const [teams, setTeams] = useState<[Team, Team]>([blankTeam(), blankTeam()]);

  useEffect(() => { try { setKey(localStorage.getItem("cs-admin-key") || ""); setApi(localStorage.getItem("cs-admin-api") || DEFAULT_API); } catch {} }, []);
  const call = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${api}${path}`, { ...init, headers: { "X-Admin-Key": key, "Content-Type": "application/json", ...(init.headers || {}) } });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.json().catch(() => ({}))).detail ?? r.statusText}`);
    return r.json();
  };
  const refresh = () => call("/admin/coverage").then((d) => setList(d.matches)).catch((e) => setMsg(String(e)));
  const connect = () => { try { localStorage.setItem("cs-admin-key", key); localStorage.setItem("cs-admin-api", api); } catch {} refresh(); };

  const save = async (publish: boolean) => {
    setMsg(null);
    if (!form.id.match(/^[A-Za-z0-9_-]+$/)) return setMsg("ID: letters, numbers, - and _ only.");
    if (teams.some((t) => !t.name || t.players.length !== 11)) return setMsg("Each team needs a name and exactly 11 players.");
    const doc = { ...form, comp_key: form.comp_key || null, venue_id: form.venue_id || null, published: true,
                  teams: teams.map((t) => ({ name: t.name, short: t.short, players: t.players.map((p) => p.id) })) };
    try {
      await call(`/admin/coverage/${form.id}`, { method: "PUT", body: JSON.stringify(doc) });
      if (publish) { setMsg("Simulating… (about 20 seconds)"); await call(`/admin/coverage/${form.id}/publish`, { method: "POST" }); }
      setMsg(publish ? "Published." : "Saved."); refresh();
    } catch (e) { setMsg(String(e)); }
  };
  const edit = async (c: Coverage) => {
    setForm({ id: c.id, title: c.title ?? "", date: c.date ?? "", start_time: "", format: c.format, gender: c.gender,
              competition: c.competition ?? "", comp_key: c.comp_key ?? "", venue: c.venue ?? "", venue_id: c.venue_id ?? "" });
    setTeams(c.teams.map((t) => ({ name: t.name, short: t.short, players: t.players.map((id) => ({ id, name: id })) })) as [Team, Team]);
  };
  const remove = async (id: string) => { if (confirm(`Remove ${id} and its published simulations?`)) { await call(`/admin/coverage/${id}`, { method: "DELETE" }); refresh(); } };

  const field = (k: keyof typeof form, label: string, type = "text") => (
    <label className="small">{label}<input type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      style={{ width: "100%", padding: "7px 8px", border: "1px solid var(--line)", background: "var(--panel)", color: "var(--ink)" }} /></label>
  );

  return (
    <div style={{ paddingTop: 32 }}>
      <div className="eyebrow">Admin</div>
      <h1>Match coverage</h1>
      <div className="card grid" style={{ gridTemplateColumns: "2fr 2fr auto", alignItems: "end" }}>
        <label className="small">API<input value={api} onChange={(e) => setApi(e.target.value)} style={{ width: "100%", padding: 7 }} /></label>
        <label className="small">Admin key<input type="password" value={key} onChange={(e) => setKey(e.target.value)} style={{ width: "100%", padding: 7 }} /></label>
        <button className="btn" onClick={connect}>Connect</button>
      </div>
      {msg && <p className="notice" style={{ marginTop: 12 }}>{msg}</p>}

      <h2 style={{ marginTop: 28 }}>Covered matches</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>ID</th><th>Match</th><th>Date</th><th>Format</th><th></th></tr></thead>
        <tbody>{list.map((c) => (
          <tr key={c.id}><td className="mono">{c.id}</td><td>{c.title ?? c.teams.map((t) => t.name).join(" v ")}</td><td>{c.date}</td><td>{c.format}</td>
            <td><button className="btn ghost" style={{ padding: "4px 10px" }} onClick={() => edit(c)}>Edit</button>{" "}
              <button className="btn ghost" style={{ padding: "4px 10px" }} onClick={() => remove(c.id)}>Remove</button></td></tr>
        ))}{!list.length && <tr><td colSpan={5} className="muted">Nothing covered yet (or not connected).</td></tr>}</tbody>
      </table></div>

      <h2 style={{ marginTop: 28 }}>Add or edit a match</h2>
      <div className="card grid g3">
        {field("id", "ID (e.g. ipl-2027-m01)")}{field("title", "Title")}{field("date", "Date", "date")}
        <label className="small">Format<select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
          {["T20", "T10", "HUNDRED", "OD"].map((f) => <option key={f}>{f}</option>)}</select></label>
        <label className="small">Gender<select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
          <option value="male">Men</option><option value="female">Women</option></select></label>
        {field("start_time", "Start time")}
        {field("competition", "Competition (display)")}{field("comp_key", "Competition ID (Cricsheet slug, optional)")}
        {field("venue", "Venue (display)")}{field("venue_id", "Venue ID (Cricsheet slug, optional)")}
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        {teams.map((t, i) => (
          <TeamEditor key={i} team={t} search={(q) => call(`/admin/players?q=${encodeURIComponent(q)}`).then((d) => d.players as Player[])}
            onChange={(nt) => setTeams((ts) => (i === 0 ? [nt, ts[1]] : [ts[0], nt]) as [Team, Team])} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button className="btn ghost" onClick={() => save(false)}>Save</button>
        <button className="btn" onClick={() => save(true)}>Save and simulate</button>
      </div>
    </div>
  );
}

function TeamEditor({ team, onChange, search }: { team: Team; onChange: (t: Team) => void; search: (q: string) => Promise<Player[]> }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Player[]>([]);
  useEffect(() => {
    if (q.length < 2) { setHits([]); return; }
    const t = setTimeout(() => search(q).then(setHits).catch(() => setHits([])), 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const move = (i: number, d: number) => {
    const p = [...team.players]; const j = i + d;
    if (j < 0 || j >= p.length) return;
    [p[i], p[j]] = [p[j], p[i]]; onChange({ ...team, players: p });
  };
  return (
    <div className="card">
      <input placeholder="Team name" value={team.name} onChange={(e) => onChange({ ...team, name: e.target.value })} style={{ width: "100%", padding: 8, fontSize: 18 }} />
      <p className="small muted" style={{ marginTop: 8 }}>XI in batting order ({team.players.length}/11). New players with no history are simulated as average newcomers.</p>
      <ol style={{ paddingLeft: 22, margin: "0 0 10px" }}>
        {team.players.map((p, i) => (
          <li key={p.id} className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ flex: 1 }}>{p.name} <span className="mono muted">{p.id}</span></span>
            <button className="iconbtn" onClick={() => move(i, -1)} aria-label="up">↑</button>
            <button className="iconbtn" onClick={() => move(i, 1)} aria-label="down">↓</button>
            <button className="iconbtn" onClick={() => onChange({ ...team, players: team.players.filter((x) => x.id !== p.id) })} aria-label="remove">✕</button>
          </li>
        ))}
      </ol>
      {team.players.length < 11 && <>
        <input placeholder="Search a player…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", padding: 8 }} />
        {hits.map((h) => (
          <button key={h.id} className="small" style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid var(--tick)", padding: "6px 2px", color: "var(--ink)", cursor: "pointer" }}
            onClick={() => { if (!team.players.some((p) => p.id === h.id)) onChange({ ...team, players: [...team.players, h] }); setQ(""); }}>
            {h.name} <span className="mono muted">{h.id}</span>
          </button>
        ))}
        <button className="btn ghost" style={{ marginTop: 8, padding: "4px 10px" }} onClick={() => {
          const id = prompt("Cricsheet ID, or a new ID for a debutant with no history:"); if (id) onChange({ ...team, players: [...team.players, { id, name: id }] });
        }}>Add by ID</button>
      </>}
    </div>
  );
}
