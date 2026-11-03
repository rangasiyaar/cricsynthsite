"use client";
// Venue intelligence: how this ground has played lately (scores, batting first v chasing, toss, phases, pace v spin),
// how the model reads it, and how this match's players have done there. From venue/<match id>.json.
import { useEffect, useState } from "react";
import { Histogram, type Marker } from "@/components/charts";
import { PhaseChart, RecentChart, SplitBar, useChartWidth } from "@/components/VenueCharts";
import { loadVenue } from "@/lib/data";
import { num, pct } from "@/lib/format";
import type { MatchDoc, VenueIntel as V, VenueStat } from "@/lib/types";

const COLORS = ["var(--team-a)", "var(--team-b)"];
const PHASE: Record<string, string> = { powerplay: "Powerplay", middle: "Middle overs", death: "Death overs" };
const year = (d?: string) => (d ? d.slice(0, 4) : "");
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** "+6%" / "−4%" of here against all grounds; `good` says which way is better for batting. */
function Delta({ here, all, invert = false }: { here?: number | null; all?: number | null; invert?: boolean }) {
  if (here == null || all == null || !all) return null;
  const d = here / all - 1;
  if (Math.abs(d) < 0.02) return <span className="vi-d">level</span>;
  const up = invert ? d < 0 : d > 0;
  return <span className={`vi-d ${up ? "bat" : "bowl"}`}>{d > 0 ? "+" : "−"}{Math.round(Math.abs(100 * d))}%</span>;
}

function Tile({ label, children, i }: { label: string; children: React.ReactNode; i: number }) {
  return <div className="card tile anim-rise" style={{ animationDelay: `${i * 60}ms` }}><div className="cs-k">{label}</div>{children}</div>;
}
const Row = ({ left, right, color }: { left: React.ReactNode; right: React.ReactNode; color?: string }) => (
  <div className="tile-row"><span className="tile-left" style={color ? { borderColor: color } : undefined}>{left}</span><span className="tile-right">{right}</span></div>
);

export default function VenueIntel({ doc }: { doc: MatchDoc }) {
  const [v, setV] = useState<V | null>(null);
  const [missing, setMissing] = useState(false);
  const chartW = useChartWidth();
  useEffect(() => { loadVenue(doc.match.id).then(setV).catch(() => setMissing(true)); }, [doc.match.id]);
  if (missing) return <p className="notice">No ground record for this match yet. It appears once the venue is matched to its history.</p>;
  if (!v) return <div className="skeleton card" style={{ minHeight: 320 }} aria-busy="true" />;

  const h = v.history, ph = v.phases, bw = v.bowling;
  const short = doc.match.teams.map((t) => t.short);
  const proj = doc.summary.teams.map((t) => t.batting.by_innings?.find((b) => b.innings === 1)?.score.mean ?? t.batting.score.mean);
  const name = v.venue.name ?? doc.match.venue ?? "This ground";
  const since = year(v.since);
  const pace = bw.here.pace, spin = bw.here.spin;
  const hist = h?.first_innings.hist ?? [];
  // the ground's own spread (from its histogram) and each side's projected first innings, as markers on one chart
  const qOf = (q: number) => { let c = 0; for (const b of hist) { c += b.p; if (c >= q) return b.x + 5; } return hist[hist.length - 1]?.x ?? 0; };
  const markers: Marker[] = [
    ...(hist.length ? [{ color: "var(--cs-ink-2)", name: "This ground", q10: qOf(0.1), q25: h!.first_innings.q25 ?? qOf(0.25),
      q50: h!.first_innings.median ?? qOf(0.5), q75: h!.first_innings.q75 ?? qOf(0.75), q90: qOf(0.9) }] : []),
    ...doc.summary.teams.map((t, k) => {
      const sc = t.batting.by_innings?.find((b) => b.innings === 1)?.score ?? t.batting.score;
      return { color: COLORS[k], name: `${t.name} batting first`, q10: sc.q["10"], q25: sc.q["25"], q50: sc.q["50"], q75: sc.q["75"], q90: sc.q["90"] };
    }),
  ];
  const recent = [...(h?.recent ?? [])].reverse().map((r) => ({
    label: new Date(`${r.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    runs: r.first.runs, team: r.first.team, defended: r.winner ? r.winner === r.first.team : null }));

  return (
    <div className="grid vi">
      <div className="tiles">
        <Tile i={0} label="The ground">
          <p className="vi-name">{name}</p>
          {v.model && <p className="vi-char">Plays {v.model.character}</p>}
          <Row left={`Matches since ${since}`} right={<b className="tile-big">{h?.matches ?? 0}</b>} />
        </Tile>
        <Tile i={1} label="First-innings score here">
          <Row left="Median" right={<><b className="tile-big">{num(h?.first_innings.median)}</b>
            <span className="tile-sub">likely<br />{num(h?.first_innings.q25)}–{num(h?.first_innings.q75)}</span></>} />
          {proj.map((p, k) => <Row key={k} color={COLORS[k]} left={<>{short[k]} <span className="tile-sub">projected batting first</span></>}
            right={<b className="tile-big">{num(p)}</b>} />)}
        </Tile>
        <Tile i={2} label="Batting first v chasing">
          <Row left="Batting first won" right={<><b className="tile-big">{pct(h?.bat_first_won)}</b><span className="tile-sub">of {h?.decided ?? 0}</span></>} />
          <Row left="Chasing won" right={<b className="tile-big">{h?.bat_first_won == null ? "—" : pct(1 - h.bat_first_won)}</b>} />
          {h?.bat_first_won != null && <SplitBar left="bat first" right="chase" p={h.bat_first_won} />}
        </Tile>
        <Tile i={3} label="Toss">
          <Row left="Winners chose to bat" right={<b className="tile-big">{pct(h?.toss.chose_bat)}</b>} />
          <Row left="Toss winner won the match" right={<b className="tile-big">{pct(h?.toss.toss_winner_won)}</b>} />
          {h?.toss.chose_bat != null && <SplitBar left="bat" right="bowl" p={h.toss.chose_bat} />}
        </Tile>
      </div>

      {hist.length > 0 && (
        <div className="card">
          <h3>First-innings scores at this ground</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Every first innings here since {since} (bars), with this ground&apos;s typical range and
            each side&apos;s projected total batting first in this match.</p>
          <Histogram W={chartW} height={chartW < 1000 ? 200 : 240} series={[{ name: "First innings here", color: "var(--cs-steel)", points: hist }]} width={10} markers={markers} xLabel="first-innings totals" />
        </div>
      )}

      <div className="grid">
        <div className="card">
          <h3>Scoring by phase</h3>
          <p className="small muted" style={{ marginTop: 0 }}>This ground against every ground in the same format since {since}.</p>
          <PhaseChart unit="runs per over" rows={["powerplay", "middle", "death"].filter((p) => ph.here[p])
            .map((p) => ({ label: PHASE[p], here: ph.here[p].runs_per_over, all: ph.all[p]?.runs_per_over }))} />
          <div className="chart-caption"><span><i style={{ background: "var(--cs-steel)" }} />This ground</span>
            <span><i style={{ background: "var(--cs-ink-3)", opacity: 0.35 }} />All grounds</span></div>
          <div className="table-wrap" style={{ marginTop: 16 }}><table>
            <thead><tr><th>Phase</th><th className="num">Runs per over</th><th className="num">Balls per wicket</th><th className="num">Boundary balls</th></tr></thead>
            <tbody>{["powerplay", "middle", "death"].filter((p) => ph.here[p]).map((p) => {
              const a = ph.here[p], b = ph.all[p];
              return <tr key={p}><td>{PHASE[p]}</td>
                <td className="num">{num(a.runs_per_over, 2)} <Delta here={a.runs_per_over} all={b?.runs_per_over} /></td>
                <td className="num">{num(a.balls_per_wicket, 1)} <Delta here={a.balls_per_wicket} all={b?.balls_per_wicket} /></td>
                <td className="num">{pct(a.boundary_pct, 1)} <Delta here={a.boundary_pct} all={b?.boundary_pct} /></td></tr>;
            })}</tbody>
          </table></div>
          <p className="small muted vi-key"><span className="vi-d bat">green</span> helps batting · <span className="vi-d bowl">red</span> helps bowling</p>
        </div>

        <div className="card">
          <h3>Pace v spin</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Every bowler at this ground since {since}, against all grounds.</p>
          {pace?.share_of_balls != null && <SplitBar left="pace" right="spin" p={pace.share_of_balls} />}
          {pace?.share_of_wickets != null && <SplitBar left="of wickets to pace" right="to spin" p={pace.share_of_wickets} />}
          {pace?.economy && spin?.economy && <>
            <div style={{ marginTop: 18 }} />
            <PhaseChart unit="runs an over" height={200} rows={[{ label: "Pace economy", here: pace.economy, all: bw.all.pace?.economy ?? undefined },
              { label: "Spin economy", here: spin.economy, all: bw.all.spin?.economy ?? undefined }]} />
            <div className="chart-caption"><span><i style={{ background: "var(--cs-steel)" }} />This ground</span>
              <span><i style={{ background: "var(--cs-ink-3)", opacity: 0.35 }} />All grounds</span></div>
          </>}
          {pace || spin ? <div className="table-wrap" style={{ marginTop: 16 }}><table>
            <thead><tr><th /><th className="num">Share of overs</th><th className="num">Economy</th><th className="num">Balls per wicket</th><th className="num">Share of wickets</th></tr></thead>
            <tbody>{(["pace", "spin"] as const).filter((k) => bw.here[k]).map((k) => {
              const a = bw.here[k] as VenueStat, b = bw.all[k];
              return <tr key={k}><td>{k === "pace" ? "Pace" : "Spin"}</td><td className="num">{pct(a.share_of_balls)}</td>
                <td className="num">{num(a.economy, 2)} <Delta here={a.economy} all={b?.economy} /></td>
                <td className="num">{num(a.balls_per_wicket, 1)} <Delta here={a.balls_per_wicket} all={b?.balls_per_wicket} /></td>
                <td className="num">{pct(a.share_of_wickets)}</td></tr>;
            })}</tbody>
          </table></div> : <p className="small muted">Not enough bowling recorded here.</p>}
          {v.model && <p className="small" style={{ marginBottom: 0 }}>Model read: runs <b>{signedPct(v.model.scoring_index)}</b>, wickets <b>{signedPct(v.model.wicket_index)}</b> against a neutral ground, after allowing for who played here.</p>}
        </div>
      </div>

      {h && h.recent.length > 0 && (
        <div className="card">
          <h3>Recent matches here</h3>
          <RecentChart rows={recent} median={h.first_innings.median} />
          <div className="table-wrap" style={{ marginTop: 16 }}><table>
            <thead><tr><th>Date</th><th>Batting first</th><th>Chasing</th><th>Result</th></tr></thead>
            <tbody>{h.recent.map((r, i) => (
              <tr key={i}><td className="small">{fmtDate(r.date)}</td>
                <td>{r.first.team} <b>{r.first.runs}/{r.first.wickets}</b></td>
                <td>{r.second ? <>{r.second.team} <b>{r.second.runs}/{r.second.wickets}</b></> : "—"}</td>
                <td className="small">{r.winner ? `${r.winner}${r.margin ? ` by ${r.margin}` : ""}` : (r.result ?? "No result")}{r.rain ? " (rain rule)" : ""}</td></tr>
            ))}</tbody>
          </table></div>
          {h.first_innings.high && h.first_innings.low && <p className="small muted" style={{ marginBottom: 0 }}>
            Highest first innings since {since}: {h.first_innings.high.team} {h.first_innings.high.runs} ({fmtDate(h.first_innings.high.date)}).
            Lowest: {h.first_innings.low.team} {h.first_innings.low.runs} ({fmtDate(h.first_innings.low.date)}).</p>}
        </div>
      )}

      {(v.players.batting.length > 0 || v.players.bowling.length > 0) && (
        <div className="grid g2">
          <div className="card">
            <h3>This XI batting here</h3>
            {v.players.batting.length ? <div className="table-wrap"><table>
              <thead><tr><th>Batter</th><th className="num">Inns</th><th className="num">Runs</th><th className="num">Avg</th><th className="num">SR</th></tr></thead>
              <tbody>{v.players.batting.map((p) => <tr key={p.id}><td><Dot doc={doc} team={p.team} />{p.name}</td><td className="num">{p.innings}</td>
                <td className="num">{p.runs}</td><td className="num">{num(p.average, 1)}</td><td className="num">{num(p.strike_rate, 1)}</td></tr>)}</tbody>
            </table></div> : <p className="small muted">No one in these XIs has batted here since {since}.</p>}
          </div>
          <div className="card">
            <h3>This XI bowling here</h3>
            {v.players.bowling.length ? <div className="table-wrap"><table>
              <thead><tr><th>Bowler</th><th className="num">Overs</th><th className="num">Wkts</th><th className="num">Econ</th></tr></thead>
              <tbody>{v.players.bowling.map((p) => <tr key={p.id}><td><Dot doc={doc} team={p.team} />{p.name}</td>
                <td className="num">{Math.floor(p.balls / 6)}{p.balls % 6 ? `.${p.balls % 6}` : ""}</td><td className="num">{p.wickets}</td>
                <td className="num">{num(p.economy, 2)}</td></tr>)}</tbody>
            </table></div> : <p className="small muted">No one in these XIs has bowled here since {since}.</p>}
          </div>
        </div>
      )}
      <p className="small muted">{doc.match.format === "OD" ? "One-day" : doc.match.format} matches{doc.match.gender === "female" ? " (women's)" : ""} at
        this ground since {since}. Rain-rule matches are left out of the score averages. Which ground traits really
        repeat: <a href="/blog/does-the-ground-matter-t20-venue-analysis/">Does the ground matter?</a></p>
    </div>
  );
}

function signedPct(x: number) {
  const d = Math.round(100 * (x - 1));
  return d === 0 ? "level" : `${d > 0 ? "+" : "−"}${Math.abs(d)}%`;
}

function Dot({ doc, team }: { doc: MatchDoc; team: string }) {
  const k = doc.summary.teams.findIndex((t) => t.name === team);
  return <span className="team-dot" style={{ background: COLORS[k < 0 ? 0 : k] }} />;
}
