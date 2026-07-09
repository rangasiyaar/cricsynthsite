import { createServerSupabase } from "@/lib/supabase-server";
import Link from "next/link";

export const metadata = { title: "Overview — Dashboard" };
export const revalidate = 60;

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-2xl font-bold font-mono text-white">{value}</p>
      <p className="text-sm mt-1" style={{ color: "#9ca3b0" }}>{label}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "#4b5263" }}>{sub}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [keysRes, usageRes] = await Promise.all([
    supabase.from("api_keys").select("key_id, label, last_used_at").eq("user_id", user.id),
    supabase.from("usage_daily").select("date, request_count").eq("user_id", user.id).gte("date", monthStart),
  ]);

  const keys = keysRes.data ?? [];
  const usage = usageRes.data ?? [];
  const todayCount = usage.filter(r => r.date === today).reduce((s, r) => s + r.request_count, 0);
  const monthCount = usage.reduce((s, r) => s + r.request_count, 0);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Overview</h1>
        <p className="text-sm mt-1" style={{ color: "#6b7280" }}>Your API usage at a glance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <StatCard label="Requests today" value={todayCount} sub="/ 100 daily limit per key" />
        <StatCard label="Requests this month" value={monthCount} />
        <StatCard label="Active API keys" value={keys.length} sub="Max 5 keys" />
      </div>

      {/* Keys summary */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Your keys</h2>
          <Link href="/dashboard/keys" className="text-xs px-3 py-1.5 rounded-lg transition-colors" style={{ color: "#818cf8", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
            Manage keys →
          </Link>
        </div>

        {keys.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-sm mb-4" style={{ color: "#9ca3b0" }}>You don&apos;t have any API keys yet.</p>
            <Link href="/dashboard/keys" className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}>
              Create your first key →
            </Link>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            {keys.map((k, i) => (
              <div key={k.key_id} className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: i < keys.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div>
                  <p className="text-sm font-medium text-white">{k.label ?? "Unnamed key"}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
                    {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : "Never used"}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Active</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { href: "/dashboard/usage", label: "View detailed usage →", desc: "Charts and per-key breakdowns" },
          { href: "/", label: "Open fan dashboard →", desc: "Upcoming matches and predictions" },
        ].map(item => (
          <Link key={item.href} href={item.href} className="rounded-xl p-5 transition-colors" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-sm font-medium" style={{ color: "#818cf8" }}>{item.label}</p>
            <p className="text-xs mt-1" style={{ color: "#6b7280" }}>{item.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
