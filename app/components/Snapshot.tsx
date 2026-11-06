"use client";
// The Overview: one screen with the most important read from every other tab — who wins, the totals, when wickets
// fall, who to watch, the key duel, the ground and the fantasy picks — each with a small chart and a link to its tab.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Num, Pct } from "@/components/charts";
import { loadVenue } from "@/lib/data";
import type { MatchDoc, Summary, TeamSummary, VenueIntel } from "@/lib/types";

const COLORS = ["var(--team-a)", "var(--team-b)"];
type Open = { onOpen?: (section: string) => void; hrefFor?: (section: string) => string; scoreboard?: boolean };

/** A block: title, its figures and chart, and "More ›" into the tab it summarises. */
function Block({ title, tab, open, children, wide = false }: { title: string; tab?: string; open: Open; children: React.ReactNode; wide?: boolean }) {
  const more = tab && (open.hrefFor
    ? <Link className="snap-more" href={open.hrefFor(tab)}>{label(tab)} ›</Link>
    : open.onOpen ? <button type="button" className="snap-more" onClick={() => open.onOpen!(tab)}>{label(tab)} ›</button> : null);
  return (
    <section className={`card snap${wide ? " snap-wide" : ""} anim-rise`}>
      <div className="snap-head"><h3>{title}</h3>{more}</div>
      {children}
    </section>
  );
}
const label = (tab: string) => ({ "Venue intelligence": "Venue", Matchups: "Batter v bowler", "Top players": "Players" } as Record<string, string>)[tab] ?? tab;

function par(s: Summary): number | null {
  const c = s.result.win_by_first_innings ?? [];
  return c.length >= 3 ? (c.find((r) => r.p_win >= 0.5)?.from ?? null) : null;
}

// ── charts ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Each side's likely (50%) and 80% range on one shared scale, the projected total marked, and the par line. */
function Ranges({ s, short, parRuns }: { s: Summary; short: string[]; parRuns: number | null }) {
  const qs = s.teams.map((t) => t.batting.score.q);
  const lo = Math.min(...qs.map((q) => q["10"])) - 5, hi = Math.max(...qs.map((q) => q["90"])) + 5;
  const W = 420, row = 30, H = row * 2 + 16, x = (v: number) => 44 + ((v - lo) / Math.max(hi - lo, 1)) * (W - 56);
  return (
    <svg className="snap-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="likely totals">
      {parRuns != null && parRuns > lo && parRuns < hi && <>
        <line x1={x(parRuns)} x2={x(parRuns)} y1={2} y2={H - 14} stroke="var(--cs-ink-3)" strokeDasharray="3 3" />
        <text x={x(parRuns)} y={H - 2} textAnchor="middle" className="snap-axis">par {parRuns}</text>
      </>}
      {qs.map((q, k) => {
        const y = 14 + k * row;
        return (
          <g key={k}>
            <text x={0} y={y + 4} className="snap-axis" style={{ fill: COLORS[k] }}>{short[k]}</text>
            <line x1={x(q["10"])} x2={x(q["90"])} y1={y} y2={y} stroke={COLORS[k]} strokeWidth={4} strokeOpacity={0.25} strokeLinecap="round" />
            <line x1={x(q["25"])} x2={x(q["75"])} y1={y} y2={y} stroke={COLORS[k]} strokeWidth={9} strokeOpacity={0.8} strokeLinecap="round" />
            <circle cx={x(q["50"])} cy={y} r={5.5} fill={COLORS[k]} stroke="var(--cs-bg)" strokeWidth={2} />
          </g>
        );
      })}
    </svg>
  );
}

/** The over in which each side is expected to lose each wicket (median over of the 1st, 2nd, … wicket), for the
 *  wickets more likely than not to fall. */
function wicketOvers(t: TeamSummary, overs: number): number[] {
  return t.batting.fall_of_wickets.filter((f) => f.p >= 0.5 && f.over?.q["50"] != null)
    .map((f) => Math.min(overs, Math.max(1, Math.ceil(f.over!.q["50"]))));
}

/** Manhattan: each side's runs in every over side by side, with a dot for each wicket in the over it's expected. */
function Manhattan({ s, short }: { s: Summary; short: string[] }) {
  const per = s.teams.map((t) => t.batting.per_over.map((o) => o.runs));
  const overs = Math.max(...per.map((p) => p.length), 1);
  const wk = s.teams.map((t) => wicketOvers(t, overs));
  const top = Math.max(...per.flat(), 1);
  const W = 420, H = 150, pad = 18, base = H - 16, topY = 30, slot = (W - pad - 4) / overs, bw = Math.max(1.5, slot / 2 - 0.6);
  const y = (v: number) => base - (v / top) * (base - topY);
  const tick = overs > 20 ? 10 : 5;
  return (
    <svg className="snap-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="runs per over and expected wickets">
      {[0.5, 1].map((f) => <line key={f} x1={pad} x2={W - 4} y1={y(top * f)} y2={y(top * f)} stroke="var(--cs-line)" strokeDasharray="2 3" />)}
      <text x={pad - 4} y={y(top) + 4} textAnchor="end" className="snap-axis">{Math.round(top)}</text>
      {per.map((p, k) => p.map((v, i) => {
        const x = pad + i * slot + k * (bw + 0.6);
        const n = wk[k].filter((o) => o === i + 1).length;
        return (
          <g key={`${k}-${i}`}>
            <rect x={x} y={y(v)} width={bw} height={base - y(v)} rx={0.8} fill={COLORS[k]} fillOpacity={0.85}>
              <title>{short[k]} over {i + 1}: {v.toFixed(1)} runs{n ? `, ${n} wicket${n > 1 ? "s" : ""} expected` : ""}</title>
            </rect>
            {Array.from({ length: n }, (_, j) => (
              <circle key={j} cx={x + bw / 2} cy={y(v) - 5 - j * 8} r={3.2} fill="var(--cs-bg)" stroke={COLORS[k]} strokeWidth={2} />
            ))}
          </g>
        );
      }))}
      <line x1={pad} x2={W - 4} y1={base} y2={base} stroke="var(--cs-ink-3)" />
      {Array.from({ length: Math.floor(overs / tick) }, (_, i) => (i + 1) * tick).map((o) => (
        <text key={o} x={pad + (o - 0.5) * slot} y={H - 3} textAnchor="middle" className="snap-axis">{o}</text>
      ))}
      {short.map((n, k) => (
        <g key={n} transform={`translate(${pad + k * 70}, 10)`}>
          <rect width={10} height={10} rx={2} fill={COLORS[k]} /><text x={14} y={9} className="snap-axis">{n}</text>
        </g>
      ))}
      <g transform={`translate(${pad + 140}, 10)`}>
        <circle cx={5} cy={5} r={3.2} fill="var(--cs-bg)" stroke="var(--cs-ink-3)" strokeWidth={2} />
        <text x={14} y={9} className="snap-axis">wicket expected</text>
      </g>
    </svg>
  );
}

/** One bar per side split into the innings' phases (width = overs), shaded by how fast wickets fall in each, with the
 *  expected wickets written in and the over each wicket is expected marked along the top. */
function PhaseTimeline({ t, color, overs }: { t: TeamSummary; color: string; overs: number }) {
  const ph = t.batting.phases;
  const rate = ph.map((p) => (p.wickets.mean ?? 0) / Math.max(1, p.overs[1] - p.overs[0] + 1));
  const max = Math.max(...rate, 1e-9);
  const W = 420, H = 58, barY = 18, barH = 30, x = (o: number) => ((o - 1) / overs) * W;
  const marks = wicketOvers(t, overs);
  return (
    <svg className="snap-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="wickets by phase">
      {ph.map((p, i) => {
        const x0 = x(p.overs[0]), x1 = x(p.overs[1] + 1);
        return (
          <g key={p.phase}>
            <rect x={x0 + 1} y={barY} width={Math.max(0, x1 - x0 - 2)} height={barH} rx={6} fill={color} fillOpacity={0.15 + 0.75 * (rate[i] / max)} />
            <text x={(x0 + x1) / 2} y={barY + 13} textAnchor="middle" className="snap-axis" style={{ fill: rate[i] / max > 0.6 ? "#fff" : "var(--cs-ink)" }}>{p.phase}</text>
            <text x={(x0 + x1) / 2} y={barY + 25} textAnchor="middle" className="snap-axis snap-axis-b" style={{ fill: rate[i] / max > 0.6 ? "#fff" : "var(--cs-ink)" }}>
              {(p.wickets.mean ?? 0).toFixed(1)} wkts
            </text>
          </g>
        );
      })}
      {marks.map((o, i) => (
        <g key={i}>
          <line x1={x(o + 0.5)} x2={x(o + 0.5)} y1={10} y2={barY} stroke={color} strokeWidth={1.5} />
          <circle cx={x(o + 0.5)} cy={8} r={3.5} fill="var(--cs-bg)" stroke={color} strokeWidth={2}><title>Wicket {i + 1}: around over {o}</title></circle>
        </g>
      ))}
    </svg>
  );
}

/** Horizontal bars for a few players' expected runs or wickets. */
function MiniBars({ rows, color, digits = 0 }: { rows: { name: string; v: number }[]; color: string; digits?: number }) {
  const max = Math.max(...rows.map((r) => r.v), 1e-9);
  return (
    <div className="snap-bars">
      {rows.map((r) => (
        <div key={r.name} className="snap-bar">
          <span className="snap-bar-name">{r.name}</span>
          <span className="snap-bar-track"><span style={{ width: `${(100 * r.v) / max}%`, background: color }} /></span>
          <b className="snap-bar-v">{digits ? r.v.toFixed(digits) : Math.round(r.v)}</b>
        </div>
      ))}
    </div>
  );
}

/** First-innings scores in the ground's recent matches, oldest to newest, with the average. */
function Sparkline({ runs, avg }: { runs: number[]; avg: number | null }) {
  if (runs.length < 2) return null;
  const lo = Math.min(...runs, avg ?? Infinity) - 10, hi = Math.max(...runs, avg ?? -Infinity) + 10;
  const W = 420, H = 80, x = (i: number) => 6 + (i / (runs.length - 1)) * (W - 12), y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (H - 12);
  return (
    <svg className="snap-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="recent first-innings scores here">
      {avg != null && <line x1={6} x2={W - 6} y1={y(avg)} y2={y(avg)} stroke="var(--cs-ink-3)" strokeDasharray="3 3" />}
      <polyline fill="none" stroke="var(--team-a)" strokeWidth={2} points={runs.map((r, i) => `${x(i)},${y(r)}`).join(" ")} />
      {runs.map((r, i) => <circle key={i} cx={x(i)} cy={y(r)} r={3} fill="var(--team-a)"><title>{r}</title></circle>)}
    </svg>
  );
}

// ── the snapshot ──────────────────────────────────────────────────────────────────────────────────────────────

export default function Snapshot({ doc, scoreboard: _scoreboard, ...open }: { doc: MatchDoc } & Open) {
  const s = doc.summary;
  const short = doc.match.teams.map((t) => t.short);
  const names = new Map<string, string>();
  s.teams.forEach((t) => t.players.forEach((p) => names.set(p.id, p.name)));
  const [v, setV] = useState<VenueIntel | null>(null);
  useEffect(() => {
    if (doc.match.venue_id) loadVenue(doc.match.id).then(setV).catch(() => setV(null));
  }, [doc.match.id, doc.match.venue_id]);

  const parRuns = par(s);
  const pp = s.teams.map((t) => t.batting.phases.find((ph) => ph.phase === "Powerplay"));
  const duel = s.matchups[0];
  const f = doc.fantasy;
  const pick = (id: string) => f?.players[id]?.name ?? names.get(id) ?? id;
  const must = f ? f.single.players.filter((p) => p !== f.single.captain && p !== f.single.vice_captain)
    .sort((a, b) => (f.players[b]?.expected ?? 0) - (f.players[a]?.expected ?? 0)).slice(0, 3) : [];
  const h = v?.history;
  const recent = h ? [...h.recent].reverse().map((r) => r.first.runs).slice(-10) : [];
  const pace = v?.bowling.here.pace?.share_of_wickets, spin = v?.bowling.here.spin?.share_of_wickets;

  return (
    <div className="snapshot">
      <Block title="The scores" tab="Scores" open={open} wide>
        <div className="snap-split">
          <div>
            <div className="snap-rows">
              {s.teams.map((t, k) => (
                <div key={t.name} className="snap-row">
                  <span style={{ color: COLORS[k] }}>{t.name}</span>
                  <span><b className="snap-mid"><Num value={t.batting.score.q["50"]} /></b>
                    <span className="snap-sub"> likely {Math.round(t.batting.score.q["25"])}–{Math.round(t.batting.score.q["75"])}</span></span>
                </div>
              ))}
            </div>
            <Ranges s={s} short={short} parRuns={parRuns} />
            <p className="snap-line">
              {parRuns != null && <>Par first-innings total <b>{parRuns}</b> · </>}
              Powerplay {short.map((n, k) => <span key={n}>{k ? ", " : ""}{n} <b><Num value={pp[k]?.runs.mean} /></b>/<Num value={pp[k]?.wickets.mean} digits={1} /></span>)}
            </p>
          </div>
          <div>
            <div className="cs-k">Runs per over · wickets</div>
            <Manhattan s={s} short={short} />
          </div>
        </div>
      </Block>

      {duel && (
        <Block title="Key duel" tab="Matchups" open={open} wide>
          <p className="snap-duel"><b>{names.get(duel.bowler) ?? duel.bowler}</b> <span className="snap-sub">dismisses</span> <b>{names.get(duel.batter) ?? duel.batter}</b>
            {" "}<b className="snap-mid" style={{ marginLeft: 8 }}><Pct p={duel.p} /></b> <span className="snap-sub">chance</span></p>
        </Block>
      )}

      <Block title="The wickets" tab="Wickets" open={open}>
        {s.teams.map((t, k) => {
          const first = t.batting.fall_of_wickets[0];
          const ph = [...t.batting.phases].sort((a, b) => (b.wickets.mean ?? 0) / Math.max(1, b.overs[1] - b.overs[0] + 1)
                                                         - (a.wickets.mean ?? 0) / Math.max(1, a.overs[1] - a.overs[0] + 1))[0];
          return (
            <div key={t.name} className="snap-wkt">
              <p className="snap-line" style={{ marginTop: k ? 12 : 0 }}>
                <b style={{ color: COLORS[k] }}>{short[k]}</b> lose the first wicket around over <b><Num value={first?.over?.q["50"]} /></b>
                {" "}· <b><Num value={t.batting.wickets.mean} digits={1} /></b> wickets
                {ph && <> · fastest in the <b>{ph.phase.toLowerCase()}</b> (overs {ph.overs[0]}–{ph.overs[1]})</>}
              </p>
              <PhaseTimeline t={t} color={COLORS[k]} overs={s.meta.rules.overs} />
            </div>
          );
        })}
      </Block>

      <Block title="Players to watch" tab="Top players" open={open}>
        <div className="snap-two">
          {s.teams.map((t, k) => {
            const bats = t.players.filter((p) => p.batting).sort((a, b) => (b.batting!.runs.mean ?? 0) - (a.batting!.runs.mean ?? 0)).slice(0, 3);
            const bowls = t.players.filter((p) => p.bowling && p.bowling.p_bowls > 0.5)
              .sort((a, b) => (b.bowling!.wickets.mean ?? 0) - (a.bowling!.wickets.mean ?? 0)).slice(0, 3);
            return (
              <div key={t.name}>
                <div className="cs-k" style={{ color: COLORS[k] }}>{short[k]} · runs</div>
                <MiniBars color={COLORS[k]} rows={bats.map((p) => ({ name: p.name, v: p.batting!.runs.mean ?? 0 }))} />
                <div className="cs-k" style={{ color: COLORS[k], marginTop: 8 }}>{short[k]} · wickets</div>
                <MiniBars color={COLORS[k]} digits={1} rows={bowls.map((p) => ({ name: p.name, v: p.bowling!.wickets.mean ?? 0 }))} />
              </div>
            );
          })}
        </div>
      </Block>


      {h && h.matches > 0 && (
        <Block title="The ground" tab="Venue intelligence" open={open}>
          <div className="snap-facts">
            <div><span className="cs-k">First innings</span><b className="snap-mid"><Num value={h.first_innings.median ?? h.first_innings.mean} /></b></div>
            {h.bat_first_won != null && <div><span className="cs-k">Chasing wins</span><b className="snap-mid"><Pct p={1 - h.bat_first_won} /></b></div>}
            {pace != null && spin != null && <div><span className="cs-k">Wickets pace · spin</span><b className="snap-mid"><Pct p={pace} /> · <Pct p={spin} /></b></div>}
          </div>
          <Sparkline runs={recent} avg={h.first_innings.mean} />
          <p className="snap-sub">Last {recent.length} first innings here</p>
        </Block>
      )}

      {f && (
        <Block title="Fantasy picks" tab="Fantasy" open={open}>
          <div className="snap-rows">
            <div className="snap-row"><span><span className="tag pro">C</span> {pick(f.single.captain)}</span><span className="snap-sub">{short[f.players[f.single.captain]?.team ?? 0]}</span></div>
            <div className="snap-row"><span><span className="tag pro">VC</span> {pick(f.single.vice_captain)}</span><span className="snap-sub">{short[f.players[f.single.vice_captain]?.team ?? 0]}</span></div>
          </div>
          <div className="cs-k" style={{ marginTop: 10 }}>Must-picks</div>
          <div className="snap-rows">
            {must.map((p) => <div key={p} className="snap-row"><span>{pick(p)}</span><span className="snap-sub">{short[f.players[p]?.team ?? 0]}</span></div>)}
          </div>
        </Block>
      )}
    </div>
  );
}
