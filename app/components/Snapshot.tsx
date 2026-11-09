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
function Block({ title, tab, open, children, wide = false, className = "" }: { title: string; tab?: string; open: Open; children: React.ReactNode; wide?: boolean; className?: string }) {
  const more = tab && (open.hrefFor
    ? <Link className="snap-more" href={open.hrefFor(tab)}>{label(tab)} ›</Link>
    : open.onOpen ? <button type="button" className="snap-more" onClick={() => open.onOpen!(tab)}>{label(tab)} ›</button> : null);
  return (
    <section className={`card snap${wide ? " snap-wide" : ""}${className ? ` ${className}` : ""} anim-rise`}>
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

/** Round tick values from at or below `lo` to at or above `hi`: steps of 1, 2, 2.5 or 5 × 10^k, about `n` of them. */
function ticks(lo: number, hi: number, n = 4): number[] {
  if (!(hi > lo)) hi = lo + 1;
  const raw = (hi - lo) / Math.max(1, n), mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(lo / step + 1e-9) * step; out.length < 50; v += step) {
    out.push(+v.toFixed(6));
    if (v >= hi - 1e-9) break;
  }
  return out;
}

/** Each side's likely (50%) and 80% range on a runs axis, the projected total marked, and the par line. */
function Ranges({ s, short, parRuns }: { s: Summary; short: string[]; parRuns: number | null }) {
  const qs = s.teams.map((t) => t.batting.score.q);
  const xt = ticks(Math.min(...qs.map((q) => q["10"]), parRuns ?? Infinity) - 3, Math.max(...qs.map((q) => q["90"]), parRuns ?? -Infinity) + 3, 5);
  const lo = xt[0], hi = xt[xt.length - 1];
  const W = 420, row = 26, top = 10, axis = top + row * 2 + 4, H = axis + 30, L = 44, R = 10;
  const x = (v: number) => L + ((v - lo) / Math.max(hi - lo, 1)) * (W - L - R);
  return (
    <svg className="snap-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="likely totals on a runs axis">
      {xt.map((v) => (
        <g key={v}><line x1={x(v)} x2={x(v)} y1={top - 4} y2={axis} stroke="var(--cs-line)" strokeDasharray="2 3" />
          <text x={x(v)} y={axis + 13} textAnchor="middle" className="snap-axis">{Math.round(v)}</text></g>
      ))}
      <line x1={L} x2={W - R} y1={axis} y2={axis} stroke="var(--cs-ink-3)" />
      <text x={W - R} y={axis + 27} textAnchor="end" className="snap-axis">runs</text>
      {parRuns != null && <>
        <line x1={x(parRuns)} x2={x(parRuns)} y1={top - 6} y2={axis} stroke="var(--cs-ink)" strokeDasharray="4 3" />
        <text x={x(parRuns)} y={axis + 27} textAnchor="middle" className="snap-axis snap-axis-b">par {parRuns}</text>
      </>}
      {qs.map((q, k) => {
        const y = top + 8 + k * row;
        return (
          <g key={k}>
            <text x={0} y={y + 4} className="snap-axis snap-axis-b" style={{ fill: COLORS[k] }}>{short[k]}</text>
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

/** Manhattan: each side's runs in every over side by side, with a ring for each wicket in the over it's expected. */
function Manhattan({ s, short }: { s: Summary; short: string[] }) {
  const per = s.teams.map((t) => t.batting.per_over.map((o) => o.runs));
  const overs = Math.max(...per.map((p) => p.length), 1);
  const wk = s.teams.map((t) => wicketOvers(t, overs));
  const yt = ticks(0, Math.max(...per.flat(), 1), 4), top = yt[yt.length - 1];
  const W = 420, H = 190, L = 30, R = 6, base = H - 34, topY = 34, slot = (W - L - R) / overs, bw = Math.max(1.5, slot / 2 - 0.6);
  const y = (v: number) => base - (v / top) * (base - topY);
  const xt = overs > 20 ? [1, 10, 20, 30, 40, 50].filter((o) => o <= overs) : [1, 5, 10, 15, 20].filter((o) => o <= overs);
  return (
    <svg className="snap-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="runs per over and expected wickets">
      {yt.map((v) => (
        <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--cs-line)" strokeDasharray={v ? "2 3" : undefined} />
          <text x={L - 5} y={y(v) + 4} textAnchor="end" className="snap-axis">{v}</text></g>
      ))}
      <text x={2} y={topY - 10} className="snap-axis">runs / over</text>
      {per.map((p, k) => p.map((v, i) => {
        const x = L + i * slot + k * (bw + 0.6);
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
      <line x1={L} x2={W - R} y1={base} y2={base} stroke="var(--cs-ink-3)" />
      {xt.map((o) => <text key={o} x={L + (o - 0.5) * slot} y={base + 14} textAnchor="middle" className="snap-axis">{o}</text>)}
      <text x={W - R} y={base + 28} textAnchor="end" className="snap-axis">overs</text>
      {short.map((n, k) => (
        <g key={n} transform={`translate(${L + 70 + k * 64}, ${topY - 20})`}>
          <rect width={10} height={10} rx={2} fill={COLORS[k]} /><text x={14} y={9} className="snap-axis">{n}</text>
        </g>
      ))}
      <g transform={`translate(${L + 200}, ${topY - 20})`}>
        <circle cx={5} cy={5} r={3.2} fill="var(--cs-bg)" stroke="var(--cs-ink-3)" strokeWidth={2} />
        <text x={14} y={9} className="snap-axis">wicket expected</text>
      </g>
    </svg>
  );
}

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
function smooth(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** Both sides' chance of losing a wicket in each over as shaded curves, over the innings' phases (labelled bands). */
function WicketCurve({ s, short }: { s: Summary; short: string[] }) {
  const v = s.teams.map((t) => t.batting.per_over.map((o) => o.p_wicket));
  const overs = Math.max(...v.map((a) => a.length), 1);
  const yt = ticks(0, Math.max(...v.flat(), 0.01), 4), top = yt[yt.length - 1];
  const W = 420, H = 190, L = 34, R = 8, base = H - 34, topY = 34;
  const x = (o: number) => L + ((o - 0.5) / overs) * (W - L - R), y = (p: number) => base - (p / top) * (base - topY);
  const phases = s.teams[0].batting.phases;
  const xt = overs > 20 ? [1, 10, 20, 30, 40, 50].filter((o) => o <= overs) : [1, 5, 10, 15, 20].filter((o) => o <= overs);
  return (
    <svg className="snap-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="chance of a wicket in each over">
      {phases.map((p, i) => {
        const x0 = L + ((p.overs[0] - 1) / overs) * (W - L - R), x1 = L + (p.overs[1] / overs) * (W - L - R);
        return (
          <g key={p.phase}>
            <rect x={x0} y={topY - 6} width={x1 - x0} height={base - topY + 6} fill={i % 2 ? "transparent" : "var(--cs-line)"} fillOpacity={0.35} />
            <text x={(x0 + x1) / 2} y={topY + 6} textAnchor="middle" className="snap-axis snap-axis-b">{p.phase}</text>
          </g>
        );
      })}
      {yt.map((p) => (
        <g key={p}><line x1={L} x2={W - R} y1={y(p)} y2={y(p)} stroke="var(--cs-line)" strokeDasharray={p ? "2 3" : undefined} />
          <text x={L - 5} y={y(p) + 4} textAnchor="end" className="snap-axis">{Math.round(100 * p)}%</text></g>
      ))}
      <text x={2} y={topY - 12} className="snap-axis">wicket chance</text>
      {v.map((a, k) => {
        const pts = a.map((p, i) => [x(i + 1), y(p)] as [number, number]);
        const line = smooth(pts);
        return (
          <g key={k}>
            <path d={`${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`} fill={COLORS[k]} fillOpacity={0.14} />
            <path d={line} fill="none" stroke={COLORS[k]} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={k ? "6 4" : undefined} />
          </g>
        );
      })}
      <line x1={L} x2={W - R} y1={base} y2={base} stroke="var(--cs-ink-3)" />
      {xt.map((o) => <text key={o} x={x(o)} y={base + 14} textAnchor="middle" className="snap-axis">{o}</text>)}
      <text x={W - R} y={base + 28} textAnchor="end" className="snap-axis">overs</text>
      {short.map((n, k) => (
        <g key={n} transform={`translate(${L + 90 + k * 70}, ${topY - 22})`}>
          <line x1={0} x2={16} y1={5} y2={5} stroke={COLORS[k]} strokeWidth={2.5} strokeDasharray={k ? "5 3" : undefined} />
          <text x={20} y={9} className="snap-axis">{n}</text>
        </g>
      ))}
    </svg>
  );
}

/** A player we know by name (a brand-new player can arrive as only an id, e.g. "kn:96533", until named). */
const named = (n: string) => !/^(kn:\d+|new:.*|[0-9a-f]{8})$/.test(n);

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

/** First-innings scores in the ground's recent matches, oldest to newest, on a runs axis, with the average. */
function Sparkline({ runs, avg }: { runs: number[]; avg: number | null }) {
  if (runs.length < 2) return null;
  const yt = ticks(Math.min(...runs, avg ?? Infinity) - 5, Math.max(...runs, avg ?? -Infinity) + 5, 4);
  const lo = yt[0], hi = yt[yt.length - 1];
  const W = 420, H = 120, L = 34, R = 10, top = 10, base = H - 30;
  const x = (i: number) => L + 6 + (i / (runs.length - 1)) * (W - L - R - 12), y = (v: number) => base - ((v - lo) / Math.max(hi - lo, 1)) * (base - top);
  return (
    <svg className="snap-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="recent first-innings scores here">
      {yt.map((v) => (
        <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--cs-line)" strokeDasharray="2 3" />
          <text x={L - 5} y={y(v) + 4} textAnchor="end" className="snap-axis">{Math.round(v)}</text></g>
      ))}
      {avg != null && <>
        <line x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} stroke="var(--cs-ink)" strokeDasharray="4 3" />
        <text x={L + 4} y={y(avg) - 4} className="snap-axis snap-axis-b">avg {Math.round(avg)}</text>
      </>}
      <polyline fill="none" stroke="var(--team-a)" strokeWidth={2} points={runs.map((r, i) => `${x(i)},${y(r)}`).join(" ")} />
      {runs.map((r, i) => <circle key={i} cx={x(i)} cy={y(r)} r={3.5} fill="var(--team-a)"><title>{r}</title></circle>)}
      <line x1={L} x2={W - R} y1={base} y2={base} stroke="var(--cs-ink-3)" />
      <text x={L + 6} y={base + 16} className="snap-axis">older</text>
      <text x={W - R} y={base + 16} textAnchor="end" className="snap-axis">latest · first-innings runs</text>
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
      <Block title="Projected Scores" tab="Scores" open={open} wide>
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

      <Block title="Projected Fall of Wickets" tab="Wickets" open={open}>
        {s.teams.map((t, k) => (
          <p key={t.name} className="snap-line" style={{ marginTop: k ? 4 : 0 }}>
            <b style={{ color: COLORS[k] }}>{short[k]}</b> lose the first wicket around over <b><Num value={t.batting.fall_of_wickets[0]?.over?.q["50"]} /></b>
            {" "}· <b><Num value={t.batting.wickets.mean} digits={1} /></b> wickets in all
          </p>
        ))}
        <WicketCurve s={s} short={short} />
        <table className="snap-table">
          <thead><tr><th />{s.teams[0].batting.phases.map((p) => <th key={p.phase}>{p.phase}<span className="snap-sub"> {p.overs[0]}–{p.overs[1]}</span></th>)}</tr></thead>
          <tbody>{s.teams.map((t, k) => (
            <tr key={t.name}><td style={{ color: COLORS[k] }}><b>{short[k]}</b></td>
              {t.batting.phases.map((p) => <td key={p.phase}><b><Num value={p.wickets.mean} digits={1} /></b> <span className="snap-sub">wkts</span></td>)}</tr>
          ))}</tbody>
        </table>
      </Block>

      <Block title="Players to watch" tab="Top players" open={open} className="snap-players">
        <div className="snap-two">
          {s.teams.map((t, k) => {
            const bats = t.players.filter((p) => p.batting && named(p.name)).sort((a, b) => (b.batting!.runs.mean ?? 0) - (a.batting!.runs.mean ?? 0)).slice(0, 5);
            const bowls = t.players.filter((p) => p.bowling && p.bowling.p_bowls > 0.5 && named(p.name))
              .sort((a, b) => (b.bowling!.wickets.mean ?? 0) - (a.bowling!.wickets.mean ?? 0)).slice(0, 5);
            return (
              <div key={t.name} className="snap-team">
                <div>
                <div className="cs-k" style={{ color: COLORS[k] }}>{short[k]} · runs</div>
                <MiniBars color={COLORS[k]} rows={bats.map((p) => ({ name: p.name, v: p.batting!.runs.mean ?? 0 }))} />
                </div>
                <div>
                <div className="cs-k" style={{ color: COLORS[k] }}>{short[k]} · wickets</div>
                <MiniBars color={COLORS[k]} digits={1} rows={bowls.map((p) => ({ name: p.name, v: p.bowling!.wickets.mean ?? 0 }))} />
                </div>
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
