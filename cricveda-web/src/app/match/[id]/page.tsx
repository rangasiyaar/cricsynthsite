import { getDreamTeam, getMatchPrediction, type DreamTeamPlayer, type PlayerPrediction } from "@/lib/api";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `Match ${params.id} Predictions — CricVeda` };
}

const ROLE_COLORS: Record<string, string> = {
  BAT: "bg-blue-500/15 text-blue-400",
  BOWL: "bg-orange-500/15 text-orange-400",
  AR: "bg-purple-500/15 text-purple-400",
  WK: "bg-yellow-500/15 text-yellow-400",
};

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null;
  return (
    <span className={`badge text-[10px] font-bold tracking-wider ${ROLE_COLORS[role] ?? "bg-white/10 text-[#9ca3b0]"}`}>
      {role}
    </span>
  );
}

function TrendBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="w-20 h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-[#6366f1] to-[#a855f7] rounded-full"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function PlayerRow({ player, rank, maxPts }: { player: PlayerPrediction; rank: number; maxPts: number }) {
  return (
    <Link
      href={`/player/${player.player_id}`}
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors group border-b border-white/[0.04] last:border-0"
    >
      <span className="w-6 text-xs font-mono text-[#4b5263] text-center">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white text-sm truncate group-hover:text-[#818cf8] transition-colors">
            {player.player_name ?? `Player #${player.player_id}`}
          </span>
          <RoleBadge role={player.role} />
        </div>
        <p className="text-xs text-[#6b7280] mt-0.5">{player.team}</p>
      </div>
      <TrendBar value={player.predicted_points} max={maxPts} />
      <div className="text-right min-w-[60px]">
        <p className="text-white font-semibold text-sm">{player.predicted_points.toFixed(1)}</p>
        <p className="text-[10px] text-[#6b7280]">{player.credits} cr</p>
      </div>
    </Link>
  );
}

function DreamTeamCard({ player }: { player: DreamTeamPlayer }) {
  return (
    <div className={`relative card p-4 flex flex-col gap-2 ${
      player.is_captain ? "border-[#6366f1]/50 bg-[#6366f1]/5" :
      player.is_vice_captain ? "border-[#818cf8]/30 bg-[#818cf8]/[0.03]" : ""
    }`}>
      {player.is_captain && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#6366f1] text-white text-[10px] font-bold rounded-full">
          CAPTAIN
        </span>
      )}
      {player.is_vice_captain && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#818cf8]/80 text-white text-[10px] font-bold rounded-full">
          VICE CAPT
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/player/${player.player_id}`} className="text-sm font-semibold text-white hover:text-[#818cf8] transition-colors truncate block">
            {player.player_name ?? `Player #${player.player_id}`}
          </Link>
          <p className="text-xs text-[#6b7280] mt-0.5 truncate">{player.team}</p>
        </div>
        <RoleBadge role={player.role} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#6b7280]">{player.credits} cr</span>
        <span className="text-sm font-bold text-white">{player.predicted_points.toFixed(1)} pts</span>
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3 text-center">
      <p className="text-lg font-bold font-mono text-white">{value}</p>
      <p className="text-[11px] text-[#6b7280] mt-0.5">{label}</p>
    </div>
  );
}

export default async function MatchPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  const [predResult, dreamResult] = await Promise.allSettled([
    getMatchPrediction(id),
    getDreamTeam(id),
  ]);

  if (predResult.status === "rejected") {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
        <p className="text-[#9ca3b0] mb-2">Could not load predictions for match #{id}.</p>
        <p className="text-sm text-[#6b7280]">
          {predResult.reason instanceof Error ? predResult.reason.message : "Unknown error"}
        </p>
        <Link href="/" className="btn-ghost mt-6 inline-flex">← Back to matches</Link>
      </div>
    );
  }

  const pred = predResult.value;
  const dream = dreamResult.status === "fulfilled" ? dreamResult.value : null;

  const maxPts = pred.players[0]?.predicted_points ?? 100;
  const team1Players = pred.players.filter((p) => p.team === pred.team1);
  const team2Players = pred.players.filter((p) => p.team === pred.team2);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Breadcrumb */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#9ca3b0] transition-colors mb-6">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" />
        </svg>
        All matches
      </Link>

      {/* Match header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="badge bg-[#6366f1]/15 text-[#818cf8]">Predictions</span>
          <span className="text-sm text-[#6b7280]">
            {new Date(pred.match_date).toLocaleDateString("en-IN", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">
          {pred.team1} <span className="text-[#4b5263]">vs</span> {pred.team2}
        </h1>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-10">
        <StatPill label="Players" value={`${pred.players.length}`} />
        <StatPill label="Top prediction" value={`${maxPts.toFixed(0)} pts`} />
        <StatPill label="Avg prediction" value={`${(pred.players.reduce((s, p) => s + p.predicted_points, 0) / Math.max(pred.players.length, 1)).toFixed(1)} pts`} />
        {dream && <StatPill label="Team credits" value={`${dream.total_credits.toFixed(1)}`} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
        {/* ── Left: player predictions ── */}
        <div className="space-y-6">
          {/* Team 1 */}
          <div>
            <p className="section-label mb-3">{pred.team1}</p>
            <div className="card overflow-hidden">
              {team1Players.map((p, i) => (
                <PlayerRow key={p.player_id} player={p} rank={i + 1} maxPts={maxPts} />
              ))}
              {team1Players.length === 0 && (
                <p className="px-5 py-6 text-sm text-[#6b7280] text-center">No squad data for {pred.team1}</p>
              )}
            </div>
          </div>

          {/* Team 2 */}
          <div>
            <p className="section-label mb-3">{pred.team2}</p>
            <div className="card overflow-hidden">
              {team2Players.map((p, i) => (
                <PlayerRow key={p.player_id} player={p} rank={i + 1} maxPts={maxPts} />
              ))}
              {team2Players.length === 0 && (
                <p className="px-5 py-6 text-sm text-[#6b7280] text-center">No squad data for {pred.team2}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: dream team ── */}
        <aside>
          {dream ? (
            <div className="sticky top-20">
              <p className="section-label mb-3">Dream XI</p>
              <div className="card p-4 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#9ca3b0]">Credits used</span>
                  <span className="font-mono font-semibold text-white">{dream.total_credits.toFixed(1)} / 100</span>
                </div>
                <div className="mt-2 h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-gradient rounded-full"
                    style={{ width: `${(dream.total_credits / 100) * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm mt-3">
                  <span className="text-[#9ca3b0]">Projected score</span>
                  <span className="font-mono font-bold text-[#818cf8]">{dream.projected_score.toFixed(0)} pts</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {dream.lineup.map((p) => (
                  <DreamTeamCard key={p.player_id} player={p} />
                ))}
              </div>
            </div>
          ) : (
            <div className="card p-6 text-center">
              <p className="text-sm text-[#9ca3b0] mb-1">Dream team unavailable</p>
              <p className="text-xs text-[#6b7280]">Squad credits must be entered in Supabase first.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
