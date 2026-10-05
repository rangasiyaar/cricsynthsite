"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { userFetch } from "@/lib/platform";
import { Button, Field, Notice, PageHeader, card, input } from "../../ui";
import type { Fixture, PlayerHit, SquadRow } from "../../types";

type Player = Pick<SquadRow, "player_id" | "team" | "batting_order" | "is_playing_xi" | "is_confirmed"> & {
  name: string;
  role: string | null;
};

function toPlayers(rows: SquadRow[]): Player[] {
  return rows.map(r => ({
    player_id: r.player_id, team: r.team, batting_order: r.batting_order,
    is_playing_xi: r.is_playing_xi, is_confirmed: r.is_confirmed,
    name: r.player_meta?.name ?? `Player ${r.player_id}`, role: r.player_meta?.primary_role ?? null,
  }));
}

function TeamSquad({
  team, players, onChange,
}: { team: string; players: Player[]; onChange: (next: Player[]) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const mine = players.filter(p => p.team === team);
  const xi = mine.filter(p => p.is_playing_xi);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      userFetch<PlayerHit[]>(`/v1/admin/players?q=${encodeURIComponent(q.trim())}`).then(setHits).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function add(hit: PlayerHit) {
    if (players.some(p => p.player_id === hit.player_id)) return;
    const used = new Set(xi.map(p => p.batting_order));
    const nextOrder = [...Array(11)].map((_, i) => i + 1).find(n => !used.has(n)) ?? null;
    onChange([...players, {
      player_id: hit.player_id, team, name: hit.name, role: hit.primary_role,
      batting_order: xi.length < 11 ? nextOrder : null, is_playing_xi: xi.length < 11, is_confirmed: false,
    }]);
    setQ(""); setHits([]);
  }

  function update(id: number, patch: Partial<Player>) {
    onChange(players.map(p => (p.player_id === id ? { ...p, ...patch } : p)));
  }

  const sorted = [...mine].sort((a, b) =>
    Number(b.is_playing_xi) - Number(a.is_playing_xi) || (a.batting_order ?? 99) - (b.batting_order ?? 99));

  return (
    <div className="p-5" style={card}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-semibold text-white">{team}</h3>
        <span className="text-xs" style={{ color: xi.length === 11 ? "#6ee7b7" : "#f59e0b" }}>{xi.length}/11 in XI</span>
      </div>
      <div className="relative mb-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a player to add…" aria-label={`Add player to ${team}`} style={input} />
        {hits.length > 0 && (
          <ul className="absolute z-10 left-0 right-0 mt-1 rounded-lg overflow-hidden" style={{ background: "#111621", border: "1px solid rgba(255,255,255,0.1)" }}>
            {hits.map(h => {
              const taken = players.some(p => p.player_id === h.player_id);
              return (
                <li key={h.player_id}>
                  <button type="button" disabled={taken} onClick={() => add(h)} className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-40" style={{ color: "#e5e7eb" }}>
                    {h.name} <span style={{ color: "#6b7280" }}>· {h.primary_role ?? "?"}{h.bowling_style ? ` · ${h.bowling_style}` : ""}{taken ? " · already added" : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {sorted.length === 0 && <p className="text-sm" style={{ color: "#6b7280" }}>No players yet.</p>}
      <ul className="flex flex-col gap-1">
        {sorted.map(p => (
          <li key={p.player_id} className="flex items-center gap-2 text-sm py-1" style={{ color: "#d1d5db" }}>
            <input
              type="number" min={1} max={11} value={p.batting_order ?? ""} disabled={!p.is_playing_xi}
              onChange={e => update(p.player_id, { batting_order: e.target.value ? Number(e.target.value) : null })}
              aria-label={`Batting position for ${p.name}`} style={{ ...input, width: "3.5rem", padding: "0.25rem 0.4rem" }}
            />
            <span className="flex-1 min-w-0 truncate">{p.name} <span style={{ color: "#6b7280" }}>{p.role ?? ""}</span></span>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={p.is_playing_xi} onChange={e => update(p.player_id, { is_playing_xi: e.target.checked, batting_order: e.target.checked ? p.batting_order : null })} />XI</label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={p.is_confirmed} disabled={!p.is_playing_xi} onChange={e => update(p.player_id, { is_confirmed: e.target.checked })} />Confirmed</label>
            <button type="button" onClick={() => onChange(players.filter(x => x.player_id !== p.player_id))} aria-label={`Remove ${p.name}`} className="px-2" style={{ color: "#f87171" }}>×</button>
          </li>
        ))}
      </ul>
      {xi.length > 0 && (
        <button type="button" className="mt-3 text-xs" style={{ color: "#818cf8" }}
          onClick={() => onChange(players.map(p => (p.team === team && p.is_playing_xi ? { ...p, is_confirmed: true } : p)))}>
          Mark whole XI as officially confirmed
        </button>
      )}
    </div>
  );
}

export default function FixtureEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [fx, setFx] = useState<Fixture | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await userFetch<Fixture & { squad: SquadRow[] }>(`/v1/admin/fixtures/${id}`);
      const { squad, ...fixture } = data;
      setFx(fixture);
      setPlayers(toPlayers(squad));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load fixture");
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function saveDetails() {
    if (!fx) return;
    setBusy(true); setError(null); setOk(null);
    try {
      const { upcoming_id: _id, ...changes } = fx;
      setFx(await userFetch<Fixture>(`/v1/admin/fixtures/${id}`, { method: "PATCH", body: JSON.stringify(changes) }));
      setOk("Fixture saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally { setBusy(false); }
  }

  async function saveSquads() {
    setBusy(true); setError(null); setOk(null);
    try {
      const body = { players: players.map(({ name: _n, role: _r, ...p }) => p) };
      const res = await userFetch<{ xi: Record<string, number> }>(`/v1/admin/fixtures/${id}/squad`, { method: "PUT", body: JSON.stringify(body) });
      setOk(`Squads saved — XI: ${Object.entries(res.xi).map(([t, n]) => `${t} ${n}`).join(", ")}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save squads");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!fx || !confirm(`Delete ${fx.team1} v ${fx.team2} and its squads?`)) return;
    setBusy(true);
    try {
      await userFetch(`/v1/admin/fixtures/${id}`, { method: "DELETE" });
      router.push("/admin/fixtures");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
      setBusy(false);
    }
  }

  if (!fx) {
    return <div className="p-8">{error ? <Notice kind="error">{error}</Notice> : <p style={{ color: "#6b7280" }}>Loading…</p>}</div>;
  }

  const set = <K extends keyof Fixture>(k: K, v: Fixture[K]) => setFx({ ...fx, [k]: v });

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/admin/fixtures" className="text-sm" style={{ color: "#818cf8" }}>← All fixtures</Link>
      <PageHeader title={`${fx.team1} v ${fx.team2}`} sub={`${fx.slug ?? "no public ID"} · ${fx.match_date} · ${fx.format}`}>
        <Button variant="danger" onClick={remove} disabled={busy}>Delete fixture</Button>
      </PageHeader>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <section className="p-5 mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" style={card}>
        <h2 className="text-sm font-semibold text-white sm:col-span-2 lg:col-span-4">Details</h2>
        <Field label="Match date"><input type="date" value={fx.match_date} onChange={e => set("match_date", e.target.value)} style={input} /></Field>
        <Field label="Status">
          <select value={fx.status} onChange={e => set("status", e.target.value as Fixture["status"])} style={input}>
            <option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <Field label="Toss winner">
          <select value={fx.toss_winner ?? ""} onChange={e => set("toss_winner", e.target.value || null)} style={input}>
            <option value="">Not yet</option><option>{fx.team1}</option><option>{fx.team2}</option>
          </select>
        </Field>
        <Field label="Toss decision">
          <select value={fx.toss_decision ?? ""} disabled={!fx.toss_winner} onChange={e => set("toss_decision", (e.target.value || null) as Fixture["toss_decision"])} style={input}>
            <option value="">—</option><option value="bat">Bat</option><option value="field">Field</option>
          </select>
        </Field>
        <div className="sm:col-span-2 lg:col-span-4"><Button onClick={saveDetails} disabled={busy}>Save details</Button></div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <TeamSquad team={fx.team1} players={players} onChange={setPlayers} />
        <TeamSquad team={fx.team2} players={players} onChange={setPlayers} />
      </div>
      <p className="text-xs mb-4" style={{ color: "#6b7280" }}>
        Unconfirmed XIs are served as <b>projected</b>; once every XI player is ticked Confirmed the API reports the XI as <b>confirmed</b>.
      </p>
      <Button onClick={saveSquads} disabled={busy}>{busy ? "Saving…" : "Save squads"}</Button>
    </div>
  );
}
