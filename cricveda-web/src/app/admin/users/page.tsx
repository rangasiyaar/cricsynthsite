"use client";

import { useEffect, useState } from "react";
import { PRODUCT_NAMES, userFetch } from "@/lib/platform";
import { Button, Notice, PageHeader, card, input } from "../ui";

interface Plan { plan_id: string; name: string; daily_limit: number; max_keys: number; products: string[] }
interface User {
  user_id: string; email: string | null; display_name: string | null; is_admin: boolean;
  plan_id: string; subscription_status: string; current_period_end: string | null;
}

export default function UsersPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { plan_id: string; until: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function load(query = q) {
    try {
      setUsers(await userFetch<User[]>(`/v1/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    }
  }

  useEffect(() => {
    userFetch<Plan[]>("/v1/admin/plans").then(setPlans).catch(e => setError(e.message));
    load("");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function draft(u: User) {
    return drafts[u.user_id] ?? { plan_id: u.plan_id, until: u.current_period_end?.slice(0, 10) ?? "" };
  }

  async function save(u: User) {
    const d = draft(u);
    setSaving(u.user_id); setError(null); setOk(null);
    try {
      await userFetch(`/v1/admin/users/${u.user_id}/subscription`, {
        method: "PUT",
        body: JSON.stringify({
          plan_id: d.plan_id, status: "active",
          current_period_end: d.until ? new Date(`${d.until}T23:59:59Z`).toISOString() : null,
        }),
      });
      setOk(`${u.email ?? u.user_id} is now on ${plans.find(p => p.plan_id === d.plan_id)?.name ?? d.plan_id}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(null); }
  }

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Users & plans" sub="One API key per account; the plan decides which products and how many requests a day." />

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        {plans.map(p => (
          <div key={p.plan_id} className="p-4" style={card}>
            <p className="font-semibold text-white">{p.name}</p>
            <p className="text-xs mt-1" style={{ color: "#9ca3b0" }}>{p.daily_limit.toLocaleString("en-IN")} requests/day · {p.max_keys} keys</p>
            <p className="text-xs mt-1" style={{ color: "#6b7280" }}>{p.products.map(x => PRODUCT_NAMES[x] ?? x).join(" · ")}</p>
          </div>
        ))}
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <form onSubmit={e => { e.preventDefault(); load(); }} className="flex gap-2 mb-4 max-w-md">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by email" aria-label="Search users by email" style={input} />
        <Button type="submit" variant="ghost">Search</Button>
      </form>

      <div style={card} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase" style={{ color: "#6b7280" }}>
              <th className="px-4 py-3">User</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Paid until</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && <tr><td colSpan={4} className="px-4 py-6" style={{ color: "#6b7280" }}>No users found.</td></tr>}
            {users.map(u => {
              const d = draft(u);
              const changed = d.plan_id !== u.plan_id || d.until !== (u.current_period_end?.slice(0, 10) ?? "");
              return (
                <tr key={u.user_id} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)", color: "#d1d5db" }}>
                  <td className="px-4 py-3">
                    <p className="text-white">{u.display_name ?? u.email}</p>
                    <p className="text-xs" style={{ color: "#6b7280" }}>{u.email}{u.is_admin ? " · admin" : ""}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select aria-label={`Plan for ${u.email}`} value={d.plan_id} onChange={e => setDrafts({ ...drafts, [u.user_id]: { ...d, plan_id: e.target.value } })} style={{ ...input, width: "auto" }}>
                      {plans.map(p => <option key={p.plan_id} value={p.plan_id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input type="date" aria-label={`Paid until for ${u.email}`} value={d.until} onChange={e => setDrafts({ ...drafts, [u.user_id]: { ...d, until: e.target.value } })} style={{ ...input, width: "auto" }} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button onClick={() => save(u)} disabled={!changed || saving === u.user_id}>{saving === u.user_id ? "Saving…" : "Save"}</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-3" style={{ color: "#6b7280" }}>Leave “Paid until” empty for no end date. After the date passes, the account drops back to Free automatically.</p>
    </div>
  );
}
