// The broadcast-style scoreboard used on the home page and at the top of the match centre: team | context | team,
// then the win bar.
import type { ReactNode } from "react";
import { Pct, WinBar } from "@/components/charts";
import { FORMAT } from "@/lib/format";
import type { MatchDoc } from "@/lib/types";

export function kickoff(date?: string | null, time?: string | null) {
  if (!date) return null;
  return new Date(`${date}T${time ?? "00:00"}:00+05:30`).toLocaleString("en-IN", {
    weekday: "short", day: "numeric", month: "short", hour: time ? "numeric" : undefined,
    minute: time ? "2-digit" : undefined, timeZone: "Asia/Kolkata",
  }) + (time ? " IST" : "");
}

export default function Scoreboard({ doc, mid, foot }: { doc: MatchDoc; mid?: ReactNode; foot?: ReactNode }) {
  const { match, summary: s } = doc;
  const [a, b] = s.teams.map((t) => t.name);
  const short = match.teams.map((t) => t.short) as [string, string];
  const when = kickoff(match.date, match.start_time);
  const team = (k: 0 | 1) => (
    <div className={`sb-team${k ? " right" : ""}`}>
      <span className="sb-badge" style={{ background: k ? "var(--team-b)" : "var(--team-a)" }}>{short[k]}</span>
      <div>
        <div className="sb-name">{k ? b : a}</div>
        <div className="sb-pct" style={{ color: k ? "var(--team-b)" : "var(--team-a)" }}><Pct p={s.result.win[k ? b : a]} /></div>
      </div>
    </div>
  );
  return (
    <div className="card scoreboard">
      <div className="sb-top">
        <span><b>{match.competition ?? "Upcoming match"}</b></span>
        <span>{[match.venue, FORMAT[match.format] ?? match.format].filter(Boolean).join(", ")}</span>
      </div>
      <div className="sb-main">
        {team(0)}
        <div className="sb-mid">
          <span className="sb-v">{when ?? "Upcoming"}</span>
          {mid}
          <span>Win probability</span>
        </div>
        {team(1)}
      </div>
      <div className="sb-bar"><WinBar a={a} b={b} pa={s.result.win[a]} pb={s.result.win[b]} big /></div>
      {foot && <div className="sb-foot">{foot}</div>}
    </div>
  );
}
