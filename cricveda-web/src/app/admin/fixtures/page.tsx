"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { userFetch } from "@/lib/platform";
import { Button, Field, Notice, PageHeader, card, input } from "../ui";
import type { Fixture } from "../types";

interface League { league_id: string; name: string; format: string }

const EMPTY = { slug: "", league_id: "", match_date: "", start_time: "", team1: "", team2: "", format: "T20" };

export default function FixturesPage() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [statusFilter, setStatusFilter] = useState<"scheduled" | "completed" | "cancelled" | "">("scheduled");
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const q = statusFilter ? `?status=${statusFilter}` : "";
      setFixtures(await userFetch<Fixture[]>(`/v1/admin/fixtures${q}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load fixtures");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { userFetch<League[]>("/v1/admin/leagues").then(setLeagues).catch(() => {}); }, []);

  // Suggest a slug like ipl-2026-m042 from league + date once the admin has picked them.
  function suggestSlug(next: typeof EMPTY) {
    if (next.slug || !next.league_id || !next.match_date) return next;
    const year = next.match_date.slice(0, 4);
    const n = String(fixtures.filter(f => f.league_id === next.league_id && f.match_date.startsWith(year)).length + 1).padStart(3, "0");
    return { ...next, slug: `${next.league_id}-${year}-m${n}`.toLowerCase() };
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setOk(null);
    try {
      const body: Record<string, string | null> = {
        ...form,
        league_id: form.league_id || null,
        start_time: form.start_time ? new Date(form.start_time).toISOString() : null,
      };
      const created = await userFetch<Fixture>("/v1/admin/fixtures", { method: "POST", body: JSON.stringify(body) });
      setOk(`Created ${created.slug}. Add the squads next.`);
      setForm(EMPTY);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create fixture");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => suggestSlug({ ...f, [k]: e.target.value }));

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Fixtures & squads" sub="Matches the prediction, simulation and graphics APIs can run on.">
        <select aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)} style={{ ...input, width: "auto" }}>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="">All</option>
        </select>
      </PageHeader>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <form onSubmit={create} className="p-5 mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" style={card}>
        <h2 className="text-sm font-semibold text-white sm:col-span-2 lg:col-span-3">New fixture</h2>
        <Field label="League">
          <select value={form.league_id} onChange={set("league_id")} style={input}>
            <option value="">—</option>
            {leagues.map(l => <option key={l.league_id} value={l.league_id}>{l.name} ({l.format})</option>)}
          </select>
        </Field>
        <Field label="Match date"><input required type="date" value={form.match_date} onChange={set("match_date")} style={input} /></Field>
        <Field label="Start time (your local time)"><input type="datetime-local" value={form.start_time} onChange={set("start_time")} style={input} /></Field>
        <Field label="Home team"><input required value={form.team1} onChange={set("team1")} placeholder="MI" style={input} /></Field>
        <Field label="Away team"><input required value={form.team2} onChange={set("team2")} placeholder="CSK" style={input} /></Field>
        <Field label="Format">
          <select value={form.format} onChange={set("format")} style={input}>
            <option>T20</option><option>ODI</option><option>Test</option>
          </select>
        </Field>
        <Field label="Public match ID" hint="Used in the API, e.g. ipl-2026-m042">
          <input required value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase() }))} placeholder="ipl-2026-m042" style={input} />
        </Field>
        <div className="flex items-end sm:col-span-2 lg:col-span-2">
          <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create fixture"}</Button>
        </div>
      </form>

      <div style={card} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "#6b7280" }} className="text-left text-xs uppercase">
              <th className="px-4 py-3">Date</th><th className="px-4 py-3">Match</th><th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Toss</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-6" style={{ color: "#6b7280" }}>Loading…</td></tr>}
            {!loading && fixtures.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6" style={{ color: "#6b7280" }}>No fixtures yet — create one above.</td></tr>
            )}
            {fixtures.map(f => (
              <tr key={f.upcoming_id} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)", color: "#d1d5db" }}>
                <td className="px-4 py-3 whitespace-nowrap">{f.match_date}</td>
                <td className="px-4 py-3 font-semibold text-white">{f.team1} v {f.team2} <span className="font-normal" style={{ color: "#6b7280" }}>· {f.format}</span></td>
                <td className="px-4 py-3 font-mono text-xs">{f.slug ?? "—"}</td>
                <td className="px-4 py-3">{f.toss_winner ? `${f.toss_winner} chose to ${f.toss_decision}` : "—"}</td>
                <td className="px-4 py-3">{f.status}</td>
                <td className="px-4 py-3 text-right"><Link href={`/admin/fixtures/${f.upcoming_id}`} style={{ color: "#818cf8" }}>Edit & squads →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
