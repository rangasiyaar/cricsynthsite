import { getPlayerForm, getPlayerMatchup } from "@/lib/api";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 1800;

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `Player #${params.id} Form — CricVeda` };
}

const ROLE_LABELS: Record<string, string> = {
  BAT: "Batter", BOWL: "Bowler", AR: "All-rounder", WK: "Wicket-keeper",
};

const TREND_CONFIG = {
  rising:  { label: "Rising",  color: "text-[#10b981]", icon: "↑" },
  falling: { label: "Falling", color: "text-red-400",    icon: "↓" },
  stable:  { label: "Stable",  color: "text-[#9ca3b0]",  icon: "→" },
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xl font-bold font-mono text-white">{value}</p>
      <p className="text-xs text-[#6b7280] mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-[#4b5263] mt-0.5">{sub}</p>}
    </div>
  );
}

function MiniBar({ value, max, color = "bg-accent-gradient" }: { value: number; max: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="w-full h-1 bg-white/[0.08] rounded-full overflow-hidden mt-1">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  const [formResult, paceResult, spinResult, leftResult] = await Promise.allSettled([
    getPlayerForm(id),
    getPlayerMatchup(id, "pace"),
    getPlayerMatchup(id, "spin"),
    getPlayerMatchup(id, "left-arm"),
  ]);

  if (formResult.status === "rejected") {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <p className="text-[#9ca3b0] mb-2">Could not load data for player #{id}.</p>
        <p className="text-sm text-[#6b7280]">
          {formResult.reason instanceof Error ? formResult.reason.message : "Unknown error"}
        </p>
        <Link href="/" className="btn-ghost mt-6 inline-flex">← All matches</Link>
      </div>
    );
  }

  const form = formResult.value;
  const pace = paceResult.status === "fulfilled" ? paceResult.value : null;
  const spin = spinResult.status === "fulfilled" ? spinResult.value : null;
  const left = leftResult.status === "fulfilled" ? leftResult.value : null;

  const trend = TREND_CONFIG[form.fp_trend] ?? TREND_CONFIG.stable;
  const maxRecent = Math.max(...form.recent_scores.map((s) => s.total_points), 1);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Breadcrumb */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#9ca3b0] transition-colors mb-6">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" />
        </svg>
        All matches
      </Link>

      {/* Player header */}
      <div className="flex items-start gap-5 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6366f1]/30 to-[#a855f7]/30 border border-[#6366f1]/25 flex items-center justify-center text-2xl font-display font-bold text-[#818cf8] shrink-0">
          {(form.name ?? `#${id}`).charAt(0)}
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
            {form.name ?? `Player #${id}`}
          </h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {form.role && (
              <span className="badge bg-[#6366f1]/15 text-[#818cf8]">
                {ROLE_LABELS[form.role] ?? form.role}
              </span>
            )}
            {form.batting_hand && (
              <span className="text-xs text-[#6b7280]">{form.batting_hand}</span>
            )}
            {form.bowling_style && (
              <span className="text-xs text-[#6b7280] capitalize">{form.bowling_style.replace(/-/g, " ")}</span>
            )}
            {form.nationality && (
              <span className="text-xs text-[#6b7280]">{form.nationality}</span>
            )}
          </div>
        </div>
        <div className={`ml-auto text-right ${trend.color}`}>
          <p className="text-3xl font-bold">{trend.icon}</p>
          <p className="text-xs font-medium mt-0.5">{trend.label}</p>
        </div>
      </div>

      {/* Performance rating averages */}
      <div className="mb-8">
        <p className="section-label mb-3">Performance Ratings</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Last 3 matches" value={form.fp_last3_avg.toFixed(1)} sub="avg pts" />
          <StatCard label="Last 5 matches" value={form.fp_last5_avg.toFixed(1)} sub="avg pts" />
          <StatCard label="Last 10 matches" value={form.fp_last10_avg.toFixed(1)} sub="avg pts" />
          <StatCard label="Consistency" value={form.fp_std5.toFixed(1)} sub="std dev (lower = steadier)" />
        </div>
      </div>

      {/* Role-specific stats */}
      {(form.role === "BAT" || form.role === "AR" || form.role === "WK") && (
        <div className="mb-8">
          <p className="section-label mb-3">Batting (last 5)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Avg runs" value={form.bat_runs_avg5.toFixed(1)} />
            <StatCard label="Strike rate" value={form.bat_sr_avg5 > 0 ? form.bat_sr_avg5.toFixed(1) : "—"} />
            <StatCard label="Boundary %" value={`${(form.bat_boundary_pct5 * 100).toFixed(1)}%`} />
          </div>
        </div>
      )}

      {(form.role === "BOWL" || form.role === "AR") && (
        <div className="mb-8">
          <p className="section-label mb-3">Bowling (last 5)</p>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Avg wickets" value={form.bowl_wkts_avg5.toFixed(1)} />
            <StatCard label="Economy" value={form.bowl_eco_avg5 > 0 ? form.bowl_eco_avg5.toFixed(2) : "—"} />
          </div>
        </div>
      )}

      {/* Matchup breakdown */}
      {(pace || spin || left) && (
        <div className="mb-8">
          <p className="section-label mb-3">Matchup Breakdown</p>
          <div className="card divide-y divide-white/[0.04]">
            {[
              { label: "vs Pace", data: pace },
              { label: "vs Spin", data: spin },
              { label: "vs Left-arm", data: left },
            ].map(({ label, data }) => (
              data && (
                <div key={label} className="flex items-center gap-4 px-5 py-3.5">
                  <span className="text-sm text-[#9ca3b0] w-28">{label}</span>
                  <div className="flex-1">
                    {data.strike_rate != null ? (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[#6b7280]">Strike Rate</span>
                          <span className="text-sm font-mono font-semibold text-white">{data.strike_rate.toFixed(1)}</span>
                        </div>
                        <MiniBar value={data.strike_rate} max={250} />
                      </>
                    ) : (
                      <span className="text-xs text-[#4b5263]">Insufficient data ({data.sample_deliveries} balls)</span>
                    )}
                  </div>
                  <span className="text-xs text-[#4b5263] shrink-0">{data.sample_deliveries} balls</span>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {/* Recent match scores */}
      {form.recent_scores.length > 0 && (
        <div>
          <p className="section-label mb-3">Recent Scores</p>
          <div className="card divide-y divide-white/[0.04]">
            {form.recent_scores.map((score, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{score.vs}</p>
                  <p className="text-xs text-[#6b7280] mt-0.5">
                    {score.match_date
                      ? new Date(score.match_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-white font-semibold font-mono">{score.total_points.toFixed(1)}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 justify-end">
                    {score.batting_points > 0 && (
                      <span className="text-[10px] text-blue-400">bat {score.batting_points.toFixed(0)}</span>
                    )}
                    {score.bowling_points > 0 && (
                      <span className="text-[10px] text-orange-400">bowl {score.bowling_points.toFixed(0)}</span>
                    )}
                    {score.fielding_points > 0 && (
                      <span className="text-[10px] text-green-400">field {score.fielding_points.toFixed(0)}</span>
                    )}
                  </div>
                </div>
                <div className="w-24 shrink-0">
                  <MiniBar value={score.total_points} max={maxRecent} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
