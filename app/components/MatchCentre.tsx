"use client";
import { useEffect, useState } from "react";
import { Methodology, PlayerLadder, RunFan, WinCurve } from "@/components/Analysis";
import LiveEngine from "@/components/LiveEngine";
import Link from "next/link";
import Scoreboard from "@/components/Scoreboard";
import { Histogram, Num, OverBars, P, WicketHeatmap } from "@/components/charts";
import { Tiles } from "@/components/Tiles";
import { KIND, num, pct, range } from "@/lib/format";
import type { MatchDoc, PlayerRow, TeamSummary } from "@/lib/types";

const TABS = ["Overview", "Scores", "Wickets", "Players", "Matchups"] as const;
type Tab = (typeof TABS)[number];
const COLORS = ["var(--team-a)", "var(--team-b)"];

export default function MatchCentre({ doc, initialTab }: { doc: MatchDoc; initialTab?: string | null }) {
  const [tab, setTab] = useState<Tab>("Overview");
  useEffect(() => { if (initialTab === "lab") window.location.replace(`/lab/?id=${encodeURIComponent(doc.match.id)}`); }, [initialTab, doc.match.id]);
  const { match, summary: s } = doc;
  const [a, b] = s.teams.map((t) => t.name);
  const pa = s.result.win[a], pb = s.result.win[b];
  return (
    <div className="page-head" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <h1 className="sr-only">{a} v {b}</h1>
      <Scoreboard doc={doc} foot={<span className="sb-note">From <Num value={s.meta.simulations} /> simulated matches
        {s.result.tie > 0.002 ? <>; tie {pct(s.result.tie, 1)}</> : null}.</span>} />

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        <Link role="tab" className="tab-link" href={`/lab/?id=${encodeURIComponent(match.id)}`}>
          MatchSynth Lab <span className="tag pro">Pro</span>
        </Link>
      </div>

      <div key={tab} className="anim-fade">
        {tab === "Overview" && <Overview doc={doc} />}
        {tab === "Scores" && <Scores doc={doc} />}
        {tab === "Wickets" && <Wickets doc={doc} />}
        {tab === "Players" && <Players doc={doc} />}
        {tab === "Matchups" && <Matchups doc={doc} />}
      </div>

      <p className="small muted" style={{ marginTop: 40 }}>
        Simulated {new Date(doc.generated_at).toLocaleString()}. Probabilities, not predictions.
      </p>
    </div>
  );
}

function Overview({ doc }: { doc: MatchDoc }) {
  const s = doc.summary;
  const short = doc.match.teams.map((t) => t.short) as [string, string];
  return (
    <div className="grid">
      <Tiles s={s} short={short} />
      <LiveEngine doc={doc} />
      <div className="grid g2"><RunFan s={s} /><WinCurve s={s} /></div>
      <div className="grid g2">
        {s.teams.map((t, k) => (
          <div key={t.name} className="card">
            <h3>{t.name}: score range</h3>
            <p className="small muted" style={{ margin: "0 0 10px" }}>Median {Math.round(t.batting.score.q["50"])}, 80% between {range(t.batting.score.q)}.</p>
            <Histogram width={t.batting.score.hist.length > 1 ? t.batting.score.hist[1].from - t.batting.score.hist[0].from : 10}
                       height={180} xLabel="runs"
                       series={[{ name: t.name, color: COLORS[k], points: t.batting.score.hist.map((h) => ({ x: h.from, p: h.p })) }]} />
          </div>
        ))}
      </div>
      <Methodology doc={doc} />
    </div>
  );
}

function Scores({ doc }: { doc: MatchDoc }) {
  const s = doc.summary;
  const width = s.teams[0].batting.score.hist.length > 1 ? s.teams[0].batting.score.hist[1].from - s.teams[0].batting.score.hist[0].from : 10;
  return (
    <div className="grid">
      <div className="card">
        <h3>Where each innings lands</h3>
        <div className="legend">{s.teams.map((t, k) => <span key={t.name}><i style={{ background: COLORS[k] }} />{t.name}</span>)}</div>
        <Histogram width={width} xLabel="runs" series={s.teams.map((t, k) => ({ name: t.name, color: COLORS[k], points: t.batting.score.hist.map((h) => ({ x: h.from, p: h.p })) }))} />
      </div>
      <div className="grid g2">
        {s.teams.map((t, k) => (
          <div key={t.name} className="card">
            <h3 style={{ color: COLORS[k] }}>{t.name}: phase by phase</h3>
            <div className="table-wrap"><table>
              <thead><tr><th>Phase</th><th>Overs</th><th className="num">Runs</th><th className="num">80% range</th><th className="num">Wickets</th><th className="num">No wicket</th></tr></thead>
              <tbody>{t.batting.phases.map((ph) => (
                <tr key={ph.phase}><td>{ph.phase}</td><td className="mono">{ph.overs[0]}–{ph.overs[1]}</td>
                  <td className="num">{num(ph.runs.mean)}</td><td className="num">{range(ph.runs.q)}</td>
                  <td className="num">{num(ph.wickets.mean, 1)}</td><td className="num">{pct(ph.p_no_wicket)}</td></tr>
              ))}</tbody>
            </table></div>
            <h3 style={{ marginTop: 20 }}>Chance of reaching…</h3>
            <div className="table-wrap"><table><tbody>
              {Object.entries(t.batting.score.p_at_least).filter((_, i, arr) => i % Math.ceil(arr.length / 6) === 0).map(([m, p]) => (
                <tr key={m}><td>{m}+</td><td className="num"><P p={p} /></td></tr>
              ))}
            </tbody></table></div>
            <p className="small muted" style={{ marginTop: 12 }}>Extras: {num(t.batting.extras.wides, 1)} wides, {num(t.batting.extras.no_balls, 1)} no-balls, {num(t.batting.extras.byes, 1)} byes/leg-byes on average.</p>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Runs per over</h3>
        <OverBars format={(v) => v.toFixed(1)} series={s.teams.map((t, k) => ({ name: t.name, color: COLORS[k], values: t.batting.per_over.map((o) => o.runs) }))} />
      </div>
    </div>
  );
}

function Wickets({ doc }: { doc: MatchDoc }) {
  const s = doc.summary;
  const overs = s.meta.rules.overs;
  return (
    <div className="grid">
      <div className="card">
        <h3>Chance of a wicket in each over</h3>
        <div className="legend">{s.teams.map((t, k) => <span key={t.name}><i style={{ background: COLORS[k] }} />{t.name} batting</span>)}</div>
        <OverBars series={s.teams.map((t, k) => ({ name: t.name, color: COLORS[k], values: t.batting.per_over.map((o) => o.p_wicket) }))} />
      </div>
      {s.teams.map((t, k) => <TeamWickets key={t.name} t={t} color={COLORS[k]} overs={overs} />)}
    </div>
  );
}

function TeamWickets({ t, color, overs }: { t: TeamSummary; color: string; overs: number }) {
  const fow = t.batting.fall_of_wickets.filter((f) => f.by_over && f.p > 0.02);
  return (
    <div className="card">
      <h3 style={{ color }}>When {t.name} lose wickets</h3>
      <p className="small muted">Each row is a wicket; darker cells are the overs it most often falls in.</p>
      <WicketHeatmap color={color} overs={overs} rows={fow.map((f) => ({ label: `Wkt ${f.wicket}`, values: f.by_over! }))} />
      <div className="table-wrap" style={{ marginTop: 16 }}><table>
        <thead><tr><th>Wicket</th><th className="num">Falls</th><th className="num">Typical over</th><th className="num">Score</th><th className="num">Partnership</th><th>Likeliest bowler</th><th>Likeliest batter out</th></tr></thead>
        <tbody>{fow.map((f) => (
          <tr key={f.wicket}><td>{f.wicket}</td><td className="num">{pct(f.p)}</td><td className="num">{num(f.over?.q["50"])}</td>
            <td className="num">{num(f.score?.q["50"])}</td><td className="num">{num(f.partnership?.q["50"])}</td>
            <td>{f.bowler?.[0] ? `${f.bowler[0].name} (${pct(f.bowler[0].p)})` : "run out / —"}</td>
            <td>{f.batter?.[0] ? `${f.batter[0].name} (${pct(f.batter[0].p)})` : "—"}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function Players({ doc }: { doc: MatchDoc }) {
  const s = doc.summary;
  const od = s.meta.format === "OD";
  const [m1, m2] = od ? ["50", "100"] : ["30", "50"];
  return (
    <div className="grid">
      <PlayerLadder s={s} />
      {s.teams.map((t, k) => (
        <div key={t.name} className="card">
          <h3 style={{ color: COLORS[k] }}>{t.name}</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>#</th><th>Batting</th><th className="num">Runs (avg)</th><th className="num">80% range</th><th className="num">{m1}+</th><th className="num">{m2}+</th><th className="num">Duck</th><th className="num">Top scorer</th><th>Most likely out to</th></tr></thead>
            <tbody>{t.players.filter((p) => p.batting).sort((x, y) => x.batting!.slot - y.batting!.slot).map((p) => (
              <tr key={p.id}><td className="mono">{p.batting!.slot}</td><td><PlayerName p={p} /></td>
                <td className="num">{num(p.batting!.runs.mean, 1)}</td><td className="num">{range(p.batting!.runs.q)}</td>
                <td className="num"><P p={p.batting!.p_at_least[m1]} width={40} /></td><td className="num">{pct(p.batting!.p_at_least[m2])}</td>
                <td className="num">{pct(p.batting!.p_duck)}</td><td className="num">{pct(p.batting!.p_top_scorer)}</td>
                <td>{p.batting!.dismissed_by[0] ? `${p.batting!.dismissed_by[0].name} (${pct(p.batting!.dismissed_by[0].p)})` : "—"}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="table-wrap" style={{ marginTop: 14 }}><table>
            <thead><tr><th>Bowling</th><th className="num">Overs</th><th className="num">Wickets (avg)</th><th className="num">2+</th><th className="num">3+</th><th className="num">Economy</th><th className="num">Best bowler</th><th>Style</th></tr></thead>
            <tbody>{t.players.filter((p) => p.bowling && p.bowling.p_bowls > 0.25).sort((x, y) => y.bowling!.overs - x.bowling!.overs).map((p) => (
              <tr key={p.id}><td><PlayerName p={p} /></td><td className="num">{num(p.bowling!.overs, 1)}</td>
                <td className="num">{num(p.bowling!.wickets.mean, 2)}</td><td className="num"><P p={p.bowling!.p_wickets["2"]} width={40} /></td>
                <td className="num">{pct(p.bowling!.p_wickets["3"])}</td><td className="num">{num(p.bowling!.economy, 2)}</td>
                <td className="num">{pct(p.bowling!.p_best_bowler)}</td><td className="small muted">{KIND[p.profile.bowling_kind ?? "unknown"]}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      ))}
      <p className="small muted">Ratings combine every league and format a player has played, adjusted for opposition strength. Hover a name for where a player&apos;s rating comes from.</p>
    </div>
  );
}

function PlayerName({ p }: { p: PlayerRow }) {
  const pr = p.profile;
  const tip = !p.known ? "No history: simulated as an average newcomer"
    : `T20-type balls: ${pr.balls_faced?.short ?? 0} faced, ${pr.balls_bowled?.short ?? 0} bowled · one-day: ${pr.balls_faced?.od ?? 0} faced, ${pr.balls_bowled?.od ?? 0} bowled (recency-weighted)`;
  return <span title={tip}>{p.name}{!p.known && <span className="tag" style={{ marginLeft: 6 }}>new</span>}</span>;
}

function Matchups({ doc }: { doc: MatchDoc }) {
  const s = doc.summary;
  const names = new Map<string, string>();
  s.teams.forEach((t) => t.players.forEach((p) => names.set(p.id, p.name)));
  return (
    <div className="card">
      <h3>Key duels</h3>
      <p className="small muted">How often each bowler dismisses each batter, across all simulations.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Bowler</th><th>Batter</th><th className="num">Dismissal share</th></tr></thead>
        <tbody>{s.matchups.slice(0, 25).map((m) => (
          <tr key={`${m.bowler}-${m.batter}`}><td>{names.get(m.bowler) ?? m.bowler}</td><td>{names.get(m.batter) ?? m.batter}</td><td className="num"><P p={m.p} width={120} /></td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/** Home-page view of the next match: score ranges, scoring and wicket rhythm, and when wickets fall. */
export function Spotlight({ doc }: { doc: MatchDoc }) {
  return (
    <>
      <div className="section">
        <div className="section-head"><div><h2>How the innings unfold</h2>
          <p>Where each total lands, the scoring and wicket rhythm over by over, and when each side&apos;s wickets fall.</p></div></div>
        <SpotlightCharts doc={doc} />
      </div>
      <div className="section">
        <div className="section-head"><div><h2>Watch the engine</h2>
          <p>The same simulator, running in your browser on this match. The estimate settles as more matches are played.</p></div></div>
        <LiveEngine doc={doc} heading={false} />
      </div>
      <div className="section">
        <div className="section-head"><div><h2>Range of outcomes</h2>
          <p>Every forecast is a spread, not a single number: team totals over time, what a first-innings score is worth,
            and each player&apos;s likely range.</p></div></div>
        <div className="grid">
          <div className="grid g2"><RunFan s={doc.summary} /><WinCurve s={doc.summary} /></div>
          <PlayerLadder s={doc.summary} />
        </div>
      </div>
      <div className="section">
        <Methodology doc={doc} />
      </div>
    </>
  );
}

function SpotlightCharts({ doc }: { doc: MatchDoc }) {
  const s = doc.summary;
  const overs = s.meta.rules.overs;
  const hist = s.teams[0].batting.score.hist;
  const width = hist.length > 1 ? hist[1].from - hist[0].from : 10;
  const legend = <div className="legend">{s.teams.map((t, k) => <span key={t.name}><i style={{ background: COLORS[k] }} />{t.name}</span>)}</div>;
  return (
    <>
    <div className="grid g3">
      <div className="card anim-rise">
        <h3>Innings totals</h3>{legend}
        <Histogram width={width} height={220} xLabel="runs"
                   series={s.teams.map((t, k) => ({ name: t.name, color: COLORS[k], points: t.batting.score.hist.map((h) => ({ x: h.from, p: h.p })) }))} />
      </div>
      <div className="card anim-rise" style={{ animationDelay: "80ms" }}>
        <h3>Runs per over</h3>{legend}
        <OverBars height={220} format={(v) => v.toFixed(1)}
                  series={s.teams.map((t, k) => ({ name: t.name, color: COLORS[k], values: t.batting.per_over.map((o) => o.runs) }))} />
      </div>
      <div className="card anim-rise" style={{ animationDelay: "160ms" }}>
        <h3>Wicket chance</h3>{legend}
        <OverBars height={220} series={s.teams.map((t, k) => ({ name: t.name, color: COLORS[k], values: t.batting.per_over.map((o) => o.p_wicket) }))} />
      </div>
    </div>
    <div className="card anim-rise" style={{ marginTop: 28, animationDelay: "240ms" }}>
      <h3>When wickets fall</h3>
      <div className="grid g2" style={{ marginTop: 8 }}>
        {s.teams.map((t, k) => (
          <div key={t.name}>
            <div className="cs-k" style={{ color: COLORS[k], marginBottom: 6 }}>{t.name} batting</div>
            <WicketHeatmap color={COLORS[k]} overs={overs}
                           rows={t.batting.fall_of_wickets.filter((f) => f.by_over && f.p > 0.05).slice(0, 6)
                             .map((f) => ({ label: `Wkt ${f.wicket}`, values: f.by_over! }))} />
          </div>
        ))}
      </div>
    </div>
    </>
  );
}
