"use client";
import { useEffect, useState } from "react";
import { ChaseCurve, Checkpoints, Methodology, PlayerLadder, RunFan, WinCurve } from "@/components/Analysis";
import LiveEngine from "@/components/LiveEngine";
import Link from "next/link";
import Scoreboard from "@/components/Scoreboard";
import { Histogram, Num, OverBars, P, WicketHeatmap, type Marker } from "@/components/charts";
import { Tiles } from "@/components/Tiles";
import { KIND, num, pct, range } from "@/lib/format";
import type { MatchDoc, PlayerRow, TeamSummary } from "@/lib/types";

const TABS = ["Overview", "Scores", "Wickets", "Players", "Matchups"] as const;
type Tab = (typeof TABS)[number];
const COLORS = ["var(--team-a)", "var(--team-b)"];
const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const TAB_ICONS: Record<string, React.ReactNode> = {
  Overview: icon("M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"),
  Scores: icon("M4 20V10M10 20V4M16 20v-7M22 20H2"),
  Wickets: icon("M7 4v16M12 4v16M17 4v16M5 4h14"),
  Players: icon("M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6"),
  Matchups: icon("M7 7h11l-3-3M17 17H6l3 3"),
  Lab: icon("M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3"),
};

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

      <div className="tabs mc-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            <span className="mc-ico" aria-hidden="true">{TAB_ICONS[t]}</span><span className="mc-label">{t}</span>
          </button>
        ))}
        <Link role="tab" className="tab-link" href={`/lab/?id=${encodeURIComponent(match.id)}`}>
          <span className="mc-ico" aria-hidden="true">{TAB_ICONS.Lab}</span>
          <span className="mc-label"><span className="mc-full">MatchSynth Lab</span><span className="mc-short">Lab</span></span>
          <span className="tag pro">Pro</span>
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


type Split = "all" | "first" | "second";

/** Each side's median, mean and 80% range, for all simulations or only when batting first / chasing. */
function markers(s: MatchDoc["summary"], split: Split = "all"): Marker[] {
  return s.teams.map((t, k) => {
    const sc = split === "all" ? t.batting.score
      : t.batting.by_innings?.find((b) => b.innings === (split === "first" ? 1 : 2))?.score ?? t.batting.score;
    return { color: COLORS[k], name: t.name, q10: sc.q["10"], q50: sc.q["50"], q90: sc.q["90"], mean: sc.mean ?? undefined };
  });
}

function histSeries(s: MatchDoc["summary"]) {
  return s.teams.map((t, k) => ({ name: t.name, color: COLORS[k], points: t.batting.score.hist.map((h) => ({ x: h.from, p: h.p })) }));
}

function binWidth(s: MatchDoc["summary"]) {
  const h = s.teams[0].batting.score.hist;
  return h.length > 1 ? h[1].from - h[0].from : 10;
}

/** Expected wickets down by the usual checkpoints, from the per-over expectations. */
function ExpectedWickets({ t, rules }: { t: TeamSummary; rules: { overs: number; pp: number } }) {
  const marks = rules.overs <= 20 ? [rules.pp, Math.round(rules.overs / 2), Math.round(rules.overs * 0.75)] : [10, 25, 40];
  const by = (o: number) => t.batting.per_over.filter((r) => r.over <= o).reduce((a, r) => a + r.wickets, 0);
  return (
    <div className="xw">Expected wickets down: {marks.map((o) => <span key={o}>by over {o} <b>{by(o).toFixed(1)}</b></span>)}</div>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
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
  const [split, setSplit] = useState<Split>("all");
  const [mode, setMode] = useState<"dist" | "cdf">("dist");
  const legend = <div className="legend">{s.teams.map((t, k) => <span key={t.name}><i style={{ background: COLORS[k] }} />{t.name}</span>)}</div>;
  return (
    <div className="grid">
      <div className="card">
        <div className="card-head">
          <h3>Where each innings lands</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Seg label="Innings" value={split} onChange={setSplit} options={[["all", "All"], ["first", "Batting first"], ["second", "Chasing"]]} />
            <Seg label="View" value={mode} onChange={setMode} options={[["dist", "Distribution"], ["cdf", "Chance of reaching"]]} />
          </div>
        </div>
        <p className="small muted" style={{ margin: "4px 0 8px" }}>Dashed line: median; ring: mean; whiskers and shading: middle 80%
          {split === "all" ? " of all simulations." : split === "first" ? " when batting first." : " when chasing."}</p>
        {legend}
        <Histogram W={1100} width={binWidth(s)} xLabel="runs" series={histSeries(s)} markers={markers(s, split)} mode={mode} height={260} />
      </div>
      <div className="grid g2"><RunFan s={s} /><Checkpoints s={s} /></div>
      <div className="card">
        <h3>Runs per over</h3>
        <p className="small muted" style={{ margin: "0 0 8px" }}>Bars: expected runs in each over. Line: three-over rolling average.</p>
        {legend}
        <OverBars W={1100} height={220} format={(v) => v.toFixed(1)} unit="runs" phases={s.meta.rules} rolling
                  series={s.teams.map((t, k) => ({ name: t.name, color: COLORS[k], values: t.batting.per_over.map((o) => o.runs) }))} />
      </div>
      <div className="grid g2"><WinCurve s={s} /><ChaseCurve s={s} /></div>
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
        <p className="small muted" style={{ margin: "0 0 8px" }}>Dashed line: the average across both innings.</p>
        <div className="legend">{s.teams.map((t, k) => <span key={t.name}><i style={{ background: COLORS[k] }} />{t.name} batting</span>)}</div>
        <OverBars W={1100} height={220} phases={s.meta.rules} average
                  series={s.teams.map((t, k) => ({ name: t.name, color: COLORS[k], values: t.batting.per_over.map((o) => o.p_wicket) }))} />
      </div>
      {s.teams.map((t, k) => <TeamWickets key={t.name} t={t} color={COLORS[k]} overs={overs} rules={s.meta.rules} />)}
    </div>
  );
}

function TeamWickets({ t, color, overs, rules }: { t: TeamSummary; color: string; overs: number; rules: { overs: number; pp: number } }) {
  const fow = t.batting.fall_of_wickets.filter((f) => f.by_over && f.p > 0.02);
  return (
    <div className="card">
      <h3 style={{ color }}>When {t.name} lose wickets</h3>
      <p className="small muted">Each row is a wicket; darker cells are the overs it most often falls in. The outlined, numbered cell is its likeliest over.</p>
      <ExpectedWickets t={t} rules={rules} />
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
  const legend = <div className="legend">{s.teams.map((t, k) => <span key={t.name}><i style={{ background: COLORS[k] }} />{t.name}</span>)}</div>;
  return (
    <>
    <div className="card anim-rise">
      <h3>When wickets fall</h3>
      <p className="small muted" style={{ margin: "0 0 4px" }}>Each row is a wicket; darker cells are the overs it most often falls in, and the
        numbered cell is its likeliest over.</p>
      <div className="grid g2" style={{ marginTop: 8 }}>
        {s.teams.map((t, k) => (
          <div key={t.name}>
            <div className="cs-k" style={{ color: COLORS[k], marginBottom: 2 }}>{t.name} batting</div>
            <ExpectedWickets t={t} rules={s.meta.rules} />
            <WicketHeatmap color={COLORS[k]} overs={overs} cell={28}
                           rows={t.batting.fall_of_wickets.filter((f) => f.by_over && f.p > 0.05).slice(0, 7)
                             .map((f) => ({ label: `Wkt ${f.wicket}`, values: f.by_over! }))} />
          </div>
        ))}
      </div>
    </div>
    <div className="grid g3" style={{ marginTop: 28 }}>
      <div className="card anim-rise">
        <h3>Innings totals</h3>{legend}
        <Histogram width={binWidth(s)} height={220} xLabel="runs" series={histSeries(s)} markers={markers(s)} compact />
      </div>
      <div className="card anim-rise" style={{ animationDelay: "80ms" }}>
        <h3>Runs per over</h3>{legend}
        <OverBars height={236} format={(v) => v.toFixed(1)} unit="runs" phases={s.meta.rules} rolling
                  series={s.teams.map((t, k) => ({ name: t.name, color: COLORS[k], values: t.batting.per_over.map((o) => o.runs) }))} />
      </div>
      <div className="card anim-rise" style={{ animationDelay: "160ms" }}>
        <h3>Wicket chance</h3>{legend}
        <OverBars height={236} phases={s.meta.rules} average
                  series={s.teams.map((t, k) => ({ name: t.name, color: COLORS[k], values: t.batting.per_over.map((o) => o.p_wicket) }))} />
      </div>
    </div>
    </>
  );
}
