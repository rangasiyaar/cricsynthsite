"use client";
// Stat tiles: label, big number, a name — instead of sentences. Built straight from the summary.
import { Num, Pct, RangeStrip } from "@/components/charts";
import type { Summary } from "@/lib/types";

type Tile = { label: string; rows: { left: React.ReactNode; right: React.ReactNode; color?: string }[] };
const COLORS = ["var(--team-a)", "var(--team-b)"];

export function buildTiles(s: Summary, short: [string, string]): Tile[] {
  const names = new Map<string, string>();
  s.teams.forEach((t) => t.players.forEach((p) => names.set(p.id, p.name)));
  const tiles: Tile[] = [];

  const qs = s.teams.map((t) => t.batting.score.q);
  const lo = Math.min(...qs.map((q) => q["10"])), hi = Math.max(...qs.map((q) => q["90"]));
  tiles.push({ label: "Projected score · median, 10th–90th", rows: s.teams.map((t, k) => {
    const q = t.batting.score.q;
    return {
      left: <>{short[k]}<RangeStrip q10={q["10"]} q50={q["50"]} q90={q["90"]} color={COLORS[k]} lo={lo} hi={hi} /></>, color: COLORS[k],
      right: <><b className="tile-big"><Num value={q["50"]} /></b><span className="tile-sub">±{Math.round((q["90"] - q["10"]) / 2)}<br />{Math.round(q["10"])}–{Math.round(q["90"])}</span></>,
    };
  }) });

  tiles.push({ label: "Top scorer", rows: s.teams.map((t, k) => {
    const top = [...t.players].filter((p) => p.batting).sort((a, b) => (b.batting!.p_top_scorer ?? 0) - (a.batting!.p_top_scorer ?? 0))[0];
    return { left: top?.name ?? "—", color: COLORS[k], right: <b className="tile-big"><Pct p={top?.batting?.p_top_scorer} /></b> };
  }) });

  tiles.push({ label: "Leading wicket-taker", rows: s.teams.map((t, k) => {
    const top = [...t.players].filter((p) => p.bowling && p.bowling.p_bowls > 0.5).sort((a, b) => (b.bowling!.p_best_bowler ?? 0) - (a.bowling!.p_best_bowler ?? 0))[0];
    return { left: top?.name ?? "—", color: COLORS[k], right: <><b className="tile-big"><Pct p={top?.bowling?.p_wickets["2"]} /></b><span className="tile-sub">2+ wkts</span></> };
  }) });

  tiles.push({ label: "First wicket", rows: s.teams.map((t, k) => {
    const f = t.batting.fall_of_wickets[0];
    const bw = f?.bowler?.[0];
    return { left: <>{short[k]} lose it ~over <b><Num value={f?.over?.q["50"]} /></b></>, color: COLORS[k],
             right: bw ? <><span className="tile-sub">{bw.name}</span><b className="tile-big"><Pct p={bw.p} /></b></> : "—" };
  }) });

  const pp = s.teams.map((t) => t.batting.phases.find((ph) => ph.phase === "Powerplay"));
  tiles.push({ label: "Powerplay", rows: s.teams.map((t, k) => ({
    left: short[k], color: COLORS[k],
    right: <><b className="tile-big"><Num value={pp[k]?.runs.mean} /></b><span className="tile-sub">for <Num value={pp[k]?.wickets.mean} digits={1} /></span></>,
  })) });

  const duel = s.matchups[0];
  if (duel) tiles.push({ label: "Key duel", rows: [{
    left: <>{names.get(duel.bowler) ?? duel.bowler} <span className="tile-sub">dismisses</span> {names.get(duel.batter) ?? duel.batter}</>,
    right: <b className="tile-big"><Pct p={duel.p} /></b>,
  }] });

  if (s.result.by_toss.length === 2) {
    const bf = Object.fromEntries(s.result.by_toss.map((bt) => [bt.batting_first, bt.win]));
    const rows = s.teams.map((t, k) => {
      const other = s.teams[1 - k].name;
      const first = bf[t.name]?.[t.name] ?? 0, chase = bf[other]?.[t.name] ?? 0;
      return { left: <>{short[k]} <span className="tile-sub">bat first v chase</span></>, color: COLORS[k],
               right: <b className="tile-big">{first - chase >= 0 ? "+" : "−"}<Num value={Math.abs(100 * (first - chase))} /> pts</b> };
    });
    tiles.push({ label: "Toss", rows });
  }
  tiles.push({ label: "Winning margin (median)", rows: [
    { left: "Batting first wins by", right: <><b className="tile-big"><Num value={s.result.margin_runs.q["50"]} /></b><span className="tile-sub">runs</span></> },
    { left: "Chasing side wins by", right: <><b className="tile-big"><Num value={s.result.margin_wickets.q["50"]} /></b><span className="tile-sub">wickets</span></> },
  ] });
  if (tiles.length % 4) tiles.push({ label: "Wickets lost (average)", rows: s.teams.map((t, k) => ({
    left: short[k], color: COLORS[k], right: <b className="tile-big"><Num value={t.batting.wickets.mean} digits={1} /></b>,
  })) });
  return tiles.slice(0, 8);
}

export function Tiles({ s, short }: { s: Summary; short: [string, string] }) {
  return (
    <div className="tiles">
      {buildTiles(s, short).map((t, i) => (
        <div key={t.label} className="card tile anim-rise" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="cs-k">{t.label}</div>
          {t.rows.map((r, j) => (
            <div key={j} className="tile-row">
              <span className="tile-left" style={r.color ? { borderColor: r.color } : undefined}>{r.left}</span>
              <span className="tile-right">{r.right}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
