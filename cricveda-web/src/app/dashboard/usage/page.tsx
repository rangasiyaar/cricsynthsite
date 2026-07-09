"use client";

import { createClient } from "@/lib/supabase";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "https://api.cricsynthesis.com";

interface UsageDay { date: string; request_count: number; key_id: string; key_label: string | null; }
interface UsageResponse { total_today: number; total_this_month: number; daily: UsageDay[]; }

const RANGES = [7, 30, 90] as const;

export default function UsagePage() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [days, setDays] = useState<30 | 7 | 90>(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const { data: s } = await supabase.auth.getSession();
      const token = s.session?.access_token ?? "";
      const res = await fetch(`${API}/v1/user/usage?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, [days]);

  // Build a date-keyed totals map
  const dailyTotals: Record<string, number> = {};
  data?.daily.forEach(r => { dailyTotals[r.date] = (dailyTotals[r.date] ?? 0) + r.request_count; });
  const dates = Object.keys(dailyTotals).sort();
  const maxCount = Math.max(...Object.values(dailyTotals), 1);

  // Unique keys
  const keyLabels: Record<string, string> = {};
  data?.daily.forEach(r => { if (r.key_id) keyLabels[r.key_id] = r.key_label ?? "Unnamed"; });

  const s = { card: { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "0.75rem" } as React.CSSProperties };

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Usage</h1>
          <p className="text-sm mt-1" style={{ color: "#6b7280" }}>API requests across all your keys</p>
        </div>
        {/* Range selector */}
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "#111621", border: "1px solid rgba(255,255,255,0.06)" }}>
          {RANGES.map(r => (
            <button key={r} onClick={() => setDays(r as typeof days)}
              className="px-3 py-1 rounded-md text-sm font-medium transition-all"
              style={{ background: days === r ? "#6366f1" : "transparent", color: days === r ? "#fff" : "#9ca3b0" }}>
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {[
          { label: "Requests today",      value: data?.total_today ?? "—" },
          { label: "Requests this month", value: data?.total_this_month ?? "—" },
        ].map(c => (
          <div key={c.label} className="p-5" style={s.card}>
            <p className="text-2xl font-bold font-mono text-white">{loading ? "…" : c.value}</p>
            <p className="text-sm mt-1" style={{ color: "#9ca3b0" }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="p-5 mb-8" style={s.card}>
        <p className="text-sm font-semibold text-white mb-4">Daily requests (last {days} days)</p>
        {loading ? (
          <div className="h-32 flex items-end gap-1">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="flex-1 rounded-t animate-pulse" style={{ height: `${20 + Math.random() * 60}%`, background: "rgba(255,255,255,0.04)" }} />
            ))}
          </div>
        ) : dates.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-sm" style={{ color: "#4b5263" }}>
            No requests in this period.
          </div>
        ) : (
          <div>
            {/* Bars */}
            <div className="flex items-end gap-0.5 h-32">
              {dates.map(d => {
                const count = dailyTotals[d] ?? 0;
                const pct = (count / maxCount) * 100;
                return (
                  <div key={d} className="flex-1 flex flex-col items-center justify-end h-full group relative" title={`${d}: ${count} requests`}>
                    <div className="w-full rounded-t-sm transition-all" style={{ height: `${Math.max(pct, 2)}%`, background: count > 0 ? "linear-gradient(to top,#6366f1,#818cf8)" : "rgba(255,255,255,0.04)" }} />
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1.5 hidden group-hover:block z-10 whitespace-nowrap rounded px-2 py-1 text-xs" style={{ background: "#111621", border: "1px solid rgba(255,255,255,0.08)", color: "#f0f0f5" }}>
                      {new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}: <strong>{count}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* X-axis labels (first, mid, last) */}
            <div className="flex justify-between mt-2">
              {[dates[0], dates[Math.floor(dates.length / 2)], dates[dates.length - 1]].filter(Boolean).map(d => (
                <span key={d} className="text-xs" style={{ color: "#4b5263" }}>
                  {new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Per-key breakdown */}
      {Object.keys(keyLabels).length > 0 && (
        <div style={s.card}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <p className="text-sm font-semibold text-white">Per-key breakdown</p>
          </div>
          {Object.entries(keyLabels).map(([kid, label], i, arr) => {
            const total = data?.daily.filter(r => r.key_id === kid).reduce((s, r) => s + r.request_count, 0) ?? 0;
            const totalAll = data?.daily.reduce((s, r) => s + r.request_count, 0) ?? 1;
            const pct = totalAll > 0 ? (total / totalAll) * 100 : 0;
            return (
              <div key={kid} className="px-5 py-3.5" style={{ borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-white">{label}</span>
                  <span className="text-sm font-mono text-white">{total} req</span>
                </div>
                <div className="w-full h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(to right,#6366f1,#818cf8)" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
