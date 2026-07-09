import { getUpcomingMatches, type UpcomingMatch } from "@/lib/api";
import { Suspense } from "react";
import Link from "next/link";

export const metadata = { title: "Upcoming Matches — CricVeda" };
export const revalidate = 300;

const LEAGUE_LABELS: Record<string, string> = {
  ipl: "IPL", t20i: "T20I", odi: "ODI", bbl: "BBL",
  psl: "PSL", sa20: "SA20", cpl: "CPL", ilt20: "ILT20",
};

const FORMAT_COLOR: Record<string, string> = {
  T20: "bg-[#6366f1]/15 text-[#818cf8]",
  ODI: "bg-[#10b981]/15 text-[#10b981]",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function MatchCard({ match }: { match: UpcomingMatch }) {
  return (
    <Link
      href={`/match/${match.upcoming_id}`}
      className="card p-5 flex flex-col gap-4 hover:border-[#6366f1]/40 hover:bg-white/[0.04] transition-all group"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`badge ${FORMAT_COLOR[match.format] ?? "bg-white/10 text-[#9ca3b0]"}`}>
            {match.format}
          </span>
          <span className="text-xs text-[#6b7280]">
            {LEAGUE_LABELS[match.league_id] ?? match.league_id.toUpperCase()}
          </span>
        </div>
        <span className="text-xs text-[#6b7280]">{formatDate(match.match_date)}</span>
      </div>

      {/* Teams */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="font-display font-semibold text-white text-lg leading-tight">{match.team1}</p>
          <p className="text-xs text-[#6b7280] mt-0.5">Home</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-mono text-[#4b5263]">VS</span>
          <div className="w-px h-6 bg-white/[0.08]" />
        </div>
        <div className="flex-1 text-right">
          <p className="font-display font-semibold text-white text-lg leading-tight">{match.team2}</p>
          <p className="text-xs text-[#6b7280] mt-0.5">Away</p>
        </div>
      </div>

      {/* Toss */}
      {match.toss_winner && (
        <p className="text-xs text-[#6b7280]">
          Toss: <span className="text-[#9ca3b0]">{match.toss_winner}</span> elected to{" "}
          <span className="text-[#9ca3b0]">{match.toss_decision}</span>
        </p>
      )}

      {/* CTA */}
      <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
        <span className="text-xs text-[#6b7280]">ML predictions ready</span>
        <span className="text-xs font-medium text-[#818cf8] group-hover:translate-x-0.5 transition-transform">
          View predictions →
        </span>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="text-[#9ca3b0] font-medium">No upcoming matches</p>
        <p className="text-sm text-[#6b7280] mt-1">
          Add fixtures via Supabase or check back soon.
        </p>
      </div>
    </div>
  );
}

async function MatchGrid({ leagueId, format }: { leagueId?: string; format?: string }) {
  let matches: UpcomingMatch[] = [];
  let error: string | null = null;

  try {
    matches = await getUpcomingMatches({
      ...(leagueId && { league_id: leagueId }),
      ...(format && { format }),
      limit: "30",
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load matches";
  }

  if (error) {
    return (
      <div className="col-span-full rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <p className="text-xs text-[#6b7280] mt-1">Check your API key in environment variables.</p>
      </div>
    );
  }

  if (matches.length === 0) return <EmptyState />;

  return (
    <>
      {matches.map((m) => (
        <MatchCard key={m.upcoming_id} match={m} />
      ))}
    </>
  );
}

const FILTERS = ["All", "T20", "ODI"];
const LEAGUES = ["All Leagues", "ipl", "t20i", "odi", "bbl", "psl", "sa20", "cpl"];

export default function HomePage({
  searchParams,
}: {
  searchParams: { format?: string; league?: string };
}) {
  const format = searchParams.format && searchParams.format !== "All" ? searchParams.format : undefined;
  const league = searchParams.league && searchParams.league !== "All Leagues" ? searchParams.league : undefined;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Hero */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#6366f1]/10 border border-[#6366f1]/25 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
          <span className="text-xs font-medium text-[#818cf8]">Live predictions</span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-white mb-3">
          Upcoming Matches
        </h1>
        <p className="text-[#9ca3b0] max-w-xl">
          ML-powered fantasy points predictions for every player in upcoming T20 and ODI fixtures.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#111621] border border-white/[0.06]">
          {FILTERS.map((f) => {
            const active = (!format && f === "All") || format === f;
            return (
              <a
                key={f}
                href={`/?format=${f}${league ? `&league=${league}` : ""}`}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                  active
                    ? "bg-[#6366f1] text-white"
                    : "text-[#9ca3b0] hover:text-white"
                }`}
              >
                {f}
              </a>
            );
          })}
        </div>
        <select
          defaultValue={league ?? "All Leagues"}
          onChange={(e) => {
            const val = e.target.value;
            const url = `/?${format ? `format=${format}&` : ""}league=${val}`;
            window.location.href = url;
          }}
          className="bg-[#111621] border border-white/[0.06] text-sm text-[#9ca3b0] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#6366f1]/50"
        >
          {LEAGUES.map((l) => (
            <option key={l} value={l}>
              {l === "All Leagues" ? l : LEAGUE_LABELS[l] ?? l.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Match grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Suspense
          fallback={Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5 h-44 animate-pulse" />
          ))}
        >
          <MatchGrid leagueId={league} format={format} />
        </Suspense>
      </div>
    </div>
  );
}
