// Share / broadcast cards as SVG: a port of cricapi/graphics.py (= cricmcp/graphics.py), byte for byte the same
// output (cricmcp/tests/test_edge_parity.py checks it).
import { escape, fixed as f, pf } from "./py.ts";

type Row = Record<string, any>;
type Theme = Record<string, string>;

export const THEMES: Record<string, Theme> = {
  dark: { bg: "#0b1220", panel: "#131c2e", text: "#e8edf6", muted: "#8b97ad", a: "#2fbf71", b: "#3d8bfd", grid: "#1f2a40" },
  light: { bg: "#f7f9fc", panel: "#ffffff", text: "#0e1726", muted: "#5b6577", a: "#1f9d5c", b: "#2563eb", grid: "#e3e8f0" },
};
const W = 1200, H = 675;
const FONT = "font-family='Barlow, Inter, Segoe UI, Arial, sans-serif'";
const th = (theme: string): Theme => THEMES[theme] ?? THEMES.dark;

function frame(t: Theme, title: string, subtitle: string, body: string, watermark: boolean): string {
  const wm = watermark ? `<text x='${W - 40}' y='${H - 28}' text-anchor='end' fill='${t.muted}' font-size='18' ${FONT}>` +
    "cricsynthesis.in · free plan</text>" : "";
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>` +
    `<rect width='${W}' height='${H}' fill='${t.bg}'/>` +
    `<text x='40' y='64' fill='${t.text}' font-size='38' font-weight='700' ${FONT}>${escape(title)}</text>` +
    `<text x='40' y='100' fill='${t.muted}' font-size='22' ${FONT}>${escape(subtitle)}</text>` +
    `${body}` +
    `<text x='40' y='${H - 28}' fill='${t.muted}' font-size='18' ${FONT}>CricSynthesis · ball-by-ball simulation` +
    `</text>${wm}</svg>`;
}

function sub(doc: Row): string {
  const m = doc.match;
  return [m.competition, m.venue, m.date].filter((x) => x).join(" · ");
}

export function win_card(doc: Row, theme = "dark", watermark = false): string {
  const t = th(theme);
  const [[a, pa], [b, pb]] = Object.entries<number>(doc.summary.result.win);
  const x0 = 40, x1 = W - 40, y = 300;
  const split = x0 + (x1 - x0) * pa;
  const proj = (doc.summary.teams as Row[]).map((tm) => tm.batting.score.q["50"]);
  let body = `<text x='${x0}' y='${y - 40}' fill='${t.a}' font-size='96' font-weight='700' ${FONT}>${f(100 * pa, 0)}%</text>` +
    `<text x='${x1}' y='${y - 40}' text-anchor='end' fill='${t.b}' font-size='96' font-weight='700' ${FONT}>${f(100 * pb, 0)}%</text>` +
    `<rect x='${x0}' y='${y}' width='${f(split - x0, 1)}' height='34' rx='6' fill='${t.a}'/>` +
    `<rect x='${f(split, 1)}' y='${y}' width='${f(x1 - split, 1)}' height='34' rx='6' fill='${t.b}'/>` +
    `<text x='${x0}' y='${y + 80}' fill='${t.text}' font-size='34' ${FONT}>${escape(a)}</text>` +
    `<text x='${x1}' y='${y + 80}' text-anchor='end' fill='${t.text}' font-size='34' ${FONT}>${escape(b)}</text>` +
    `<text x='${x0}' y='${y + 122}' fill='${t.muted}' font-size='24' ${FONT}>Projected score ${f(proj[0], 0)}</text>` +
    `<text x='${x1}' y='${y + 122}' text-anchor='end' fill='${t.muted}' font-size='24' ${FONT}>Projected score ${f(proj[1], 0)}</text>`;
  if (doc.insights && doc.insights.length) {
    body += `<text x='${x0}' y='${y + 210}' fill='${t.text}' font-size='26' ${FONT}>${escape(doc.insights[0].text)}</text>`;
  }
  return frame(t, doc.match.title || `${a} v ${b}`, sub(doc), body, watermark);
}

export function scores_card(doc: Row, theme = "dark", watermark = false): string {
  const t = th(theme);
  const teams: Row[] = doc.summary.teams;
  const hists: Row[][] = teams.map((tm) => tm.batting.score.hist);
  const lo = Math.min(...hists.map((h) => h[0].from)), hi = Math.max(...hists.map((h) => h[h.length - 1].to));
  const width = hists[0][0].to - hists[0][0].from;
  const bins: number[] = [];
  for (let v = lo; v < hi; v += width) bins.push(v);
  const pmax = Math.max(...hists.flatMap((h) => h.map((x) => x.p))) || 1;
  const x0 = 60, y0 = 150, w = W - 120, h = 380;
  const bw = w / bins.length;
  let body = "";
  teams.forEach((tm, k) => {
    const col = [t.a, t.b][k];
    const by = new Map<number, number>(hists[k].map((x) => [x.from, x.p]));
    bins.forEach((bn, i) => {
      const p = by.get(bn) ?? 0;
      const bh = h * p / pmax;
      body += `<rect x='${f(x0 + i * bw + k * bw / 2 + 2, 1)}' y='${f(y0 + h - bh, 1)}' width='${f(bw / 2 - 4, 1)}' ` +
        `height='${f(bh, 1)}' rx='3' fill='${col}'/>`;
    });
    const q = tm.batting.score.q;
    body += `<text x='${pf(x0 + k * w / 2)}' y='${y0 + h + 80}' fill='${col}' font-size='26' ${FONT}>` +
      `${escape(tm.name)}: ${f(q["50"], 0)} (80%: ${f(q["10"], 0)}–${f(q["90"], 0)})</text>`;
  });
  bins.forEach((bn, i) => {
    if (i % 2 === 0) body += `<text x='${f(x0 + i * bw, 1)}' y='${y0 + h + 28}' fill='${t.muted}' font-size='18' ${FONT}>${bn}</text>`;
  });
  return frame(t, "Where the scores land", sub(doc), body, watermark);
}

export function wickets_card(doc: Row, team = 0, theme = "dark", watermark = false): string {
  const t = th(theme);
  const tm = doc.summary.teams[team];
  const fow: Row[] = (tm.batting.fall_of_wickets as Row[]).filter((x) => x.by_over && x.by_over.length);
  const overs = tm.batting.per_over.length;
  const x0 = 150, y0 = 140;
  const cw = (W - x0 - 60) / overs;
  const ch = Math.min(42, 420 / Math.max(fow.length, 1));
  const vals = fow.flatMap((x) => x.by_over as number[]);
  const vmax = (vals.length ? Math.max(...vals) : 1) || 1;
  const col = team === 0 ? t.a : t.b;
  let body = "";
  fow.slice(0, 10).forEach((fw, rr) => {
    body += `<text x='${x0 - 16}' y='${f(y0 + rr * ch + ch * 0.68, 1)}' text-anchor='end' fill='${t.muted}' ` +
      `font-size='18' ${FONT}>Wkt ${fw.wicket}</text>`;
    (fw.by_over as number[]).forEach((v, o) => {
      body += `<rect x='${f(x0 + o * cw, 1)}' y='${f(y0 + rr * ch, 1)}' width='${f(cw - 2, 1)}' height='${f(ch - 2, 1)}' ` +
        `fill='${col}' fill-opacity='${f(0.06 + 0.94 * v / vmax, 3)}'/>`;
    });
  });
  const step = overs <= 20 ? 1 : 5;
  for (let o = 0; o < overs; o += step) {
    body += `<text x='${f(x0 + o * cw + cw / 2, 1)}' y='${f(y0 + fow.slice(0, 10).length * ch + 26, 1)}' text-anchor='middle' ` +
      `fill='${t.muted}' font-size='16' ${FONT}>${o + 1}</text>`;
  }
  return frame(t, `When ${tm.name} lose wickets`, "Darker = likelier · " + sub(doc), body, watermark);
}

export function player_card(doc: Row, pid: string, theme = "dark", watermark = false): string | null {
  const t = th(theme);
  const teams: Row[] = doc.summary.teams;
  for (let k = 0; k < teams.length; k++) {
    const tm = teams[k];
    for (const p of tm.players as Row[]) {
      if (p.id !== pid) continue;
      const col = k === 0 ? t.a : t.b;
      const rows: [string, number | null][] = [];
      if (p.batting) {
        for (const [m, v] of Object.entries<number>(p.batting.p_at_least)) rows.push([`${m}+ runs`, v]);
        rows.push(["Top scorer", p.batting.p_top_scorer]);
      }
      if (p.bowling && (p.bowling.p_bowls || 0) > 0.5) {
        for (const [m, v] of Object.entries<number>(p.bowling.p_wickets).slice(0, 3)) rows.push([`${m}+ wickets`, v]);
      }
      let body = "";
      rows.slice(0, 9).forEach(([label, v], i) => {
        const y = 150 + i * 52;
        body += `<text x='40' y='${y + 28}' fill='${t.text}' font-size='24' ${FONT}>${escape(label)}</text>` +
          `<rect x='260' y='${y + 6}' width='${f((W - 420) * (v || 0), 1)}' height='30' rx='5' fill='${col}'/>` +
          `<text x='${W - 60}' y='${y + 30}' text-anchor='end' fill='${t.text}' font-size='24' ` +
          `${FONT}>${f(100 * (v || 0), 0)}%</text>`;
      });
      return frame(t, `${p.name} · ${tm.name}`, sub(doc), body, watermark);
    }
  }
  return null;
}

function names(doc: Row): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tm of doc.summary.teams) for (const p of tm.players) out[p.id] = p.name;
  return out;
}

export function worm_card(doc: Row, theme = "dark", watermark = false): string {
  const t = th(theme);
  const teams: Row[] = doc.summary.teams;
  const curves = teams.map((tm) => {
    let acc = 0.0;
    return (tm.batting.per_over as Row[]).map((o) => (acc += o.runs || 0));
  });
  const overs = Math.max(...curves.map((c) => c.length));
  const top = Math.max(...curves.map((c) => Math.max(...c))) || 1;
  const x0 = 90, y0 = 140, w = W - 160, h = 400;
  let body = "";
  const gstep = top > 120 ? 50 : 20;
  for (let v = 0; v < Math.trunc(top) + 1; v += gstep) {
    const y = y0 + h - h * v / top;
    body += `<line x1='${x0}' x2='${x0 + w}' y1='${f(y, 1)}' y2='${f(y, 1)}' stroke='${t.grid}'/>` +
      `<text x='${x0 - 12}' y='${f(y + 6, 1)}' text-anchor='end' fill='${t.muted}' font-size='16' ${FONT}>${v}</text>`;
  }
  curves.forEach((pts, k) => {
    const col = [t.a, t.b][k];
    const path = pts.map((v, i) => `${i === 0 ? "M" : "L"}${f(x0 + w * (i + 1) / overs, 1)},${f(y0 + h - h * v / top, 1)}`).join(" ");
    body += `<path d='M${x0},${y0 + h} ${path.startsWith("M") ? path.slice(1) : path}' fill='none' stroke='${col}' stroke-width='4'/>`;
    body += `<text x='${pf(x0 + k * w / 2)}' y='${y0 + h + 70}' fill='${col}' font-size='26' ${FONT}>` +
      `${escape(teams[k].name)}: ${f(pts[pts.length - 1], 0)} expected</text>`;
  });
  const step = overs > 20 ? 5 : 2;
  for (let o = step; o < overs + 1; o += step) {
    body += `<text x='${f(x0 + w * o / overs, 1)}' y='${y0 + h + 28}' text-anchor='middle' fill='${t.muted}' ` +
      `font-size='16' ${FONT}>${o}</text>`;
  }
  return frame(t, "Expected run worm", sub(doc), body, watermark);
}

export function phases_card(doc: Row, theme = "dark", watermark = false): string {
  const t = th(theme);
  const teams: Row[] = doc.summary.teams;
  const rows: [string, Row[]][] = (teams[0].batting.phases as Row[]).map((ph, i) => [ph.phase, teams.map((tm) => tm.batting.phases[i])]);
  const vmax = Math.max(...rows.flatMap(([, pair]) => pair.map((x) => x.runs.mean || 0))) || 1;
  let body = "";
  rows.forEach(([name, pair], rr) => {
    const y = 160 + rr * 150;
    body += `<text x='40' y='${y + 22}' fill='${t.text}' font-size='26' font-weight='700' ${FONT}>${escape(name)}</text>`;
    pair.forEach((x, k) => {
      const col = [t.a, t.b][k];
      const yy = y + 40 + k * 46;
      const ln = (W - 520) * (x.runs.mean || 0) / vmax;
      body += `<rect x='300' y='${yy}' width='${f(ln, 1)}' height='34' rx='5' fill='${col}'/>` +
        `<text x='40' y='${yy + 26}' fill='${t.muted}' font-size='20' ${FONT}>${escape(teams[k].name)}</text>` +
        `<text x='${f(310 + ln, 1)}' y='${yy + 26}' fill='${t.text}' font-size='22' ${FONT}>` +
        `${f(x.runs.mean, 0)} runs · ${f(x.wickets.mean, 1)} wkts</text>`;
    });
  });
  return frame(t, "Phase by phase", sub(doc), body, watermark);
}

export function duels_card(doc: Row, theme = "dark", watermark = false): string {
  const t = th(theme);
  const nm = names(doc);
  const rows: Row[] = (doc.summary.matchups || []).slice(0, 7);
  const vmax = (rows.length ? Math.max(...rows.map((x) => x.p)) : 1) || 1;
  let body = "";
  rows.forEach((x, i) => {
    const y = 150 + i * 62;
    const label = `${nm[x.bowler] ?? x.bowler} dismisses ${nm[x.batter] ?? x.batter}`;
    body += `<text x='40' y='${y + 28}' fill='${t.text}' font-size='24' ${FONT}>${escape(label)}</text>` +
      `<rect x='680' y='${y + 6}' width='${f((W - 820) * x.p / vmax, 1)}' height='30' rx='5' fill='${t.a}'/>` +
      `<text x='${W - 40}' y='${y + 30}' text-anchor='end' fill='${t.text}' font-size='24' ${FONT}>${f(100 * x.p, 0)}%</text>`;
  });
  return frame(t, "Key duels", "Chance each bowler dismisses each batter · " + sub(doc), body, watermark);
}

// ── analytics cards (from the model, not a match) ──

function bars(t: Theme, rows: [string, number, string][], xLabel = 40, xBar = 420, top = 150, step = 64, col?: string): string {
  const vmax = (rows.length ? Math.max(...rows.map(([, v]) => Math.abs(v))) : 1) || 1;
  let body = "";
  rows.forEach(([label, v, txt], i) => {
    const y = top + i * step;
    body += `<text x='${xLabel}' y='${y + 28}' fill='${t.text}' font-size='24' ${FONT}>${escape(label)}</text>` +
      `<rect x='${xBar}' y='${y + 6}' width='${f((W - xBar - 200) * Math.abs(v) / vmax, 1)}' height='30' rx='5' ` +
      `fill='${col || t.a}'/>` +
      `<text x='${W - 40}' y='${y + 30}' text-anchor='end' fill='${t.text}' font-size='24' ${FONT}>${escape(txt)}</text>`;
  });
  return body;
}

export function player_profile_card(prof: Row, theme = "dark", watermark = false): string {
  const t = th(theme);
  const p = prof.player;
  const rows: [string, number, string][] = [];
  for (const [ph, m] of Object.entries<Row>(prof.batting)) {
    rows.push([`Strike rate · ${ph}`, m.strike_rate || 0, `${f(m.strike_rate, 0)}  (${f(m.v_average.strike_rate, 2)}×)`]);
  }
  for (const [ph, m] of Object.entries<Row>(prof.bowling)) {
    rows.push([`Economy · ${ph}`, m.economy || 0, `${f(m.economy, 2)}  (${f(m.v_average.economy, 2)}×)`]);
  }
  const s = `${prof.format} · ${p.hand}-hand bat · ${String(p.bowling_kind).replaceAll("_", " ")} · v average player`;
  return frame(t, p.name, s, bars(t, rows, 40, 420, 150, 70), watermark);
}

export function matchup_card(mu: Row, theme = "dark", watermark = false): string {
  const t = th(theme);
  const me = mu.matchup, avg = mu.average_pairing;
  const rows: [string, number, string][] = [
    ["Strike rate", me.strike_rate, `${f(me.strike_rate, 0)} v ${f(avg.strike_rate, 0)} avg`],
    ["Balls per dismissal", me.balls_per_dismissal || 0, `${f(me.balls_per_dismissal || 0, 0)} v ${f(avg.balls_per_dismissal || 0, 0)} avg`],
    ["Dot balls %", me.dot_pct, `${f(me.dot_pct, 0)}% v ${f(avg.dot_pct, 0)}%`],
    ["Boundary %", me.boundary_pct, `${f(me.boundary_pct, 0)}% v ${f(avg.boundary_pct, 0)}%`],
  ];
  const title = `${mu.batter.name} v ${mu.bowler.name}`;
  return frame(t, title, `${mu.format} · ${mu.phase} overs · per-ball model`, bars(t, rows, 40, 420, 170, 90), watermark);
}

export function venue_card(v: Row, theme = "dark", watermark = false): string {
  const t = th(theme);
  const rows: [string, number, string][] = [];
  for (const [ph, m] of Object.entries<Row>(v.by_phase)) {
    rows.push([`Runs per over · ${ph}`, m.runs_per_over || 0, `${f(m.runs_per_over, 2)}  (${f(m.v_neutral.scoring, 2)}×)`]);
  }
  for (const [ph, m] of Object.entries<Row>(v.by_phase)) {
    rows.push([`Balls per wicket · ${ph}`, m.balls_per_wicket || 0, `${f(m.balls_per_wicket || 0, 0)}  (${f(m.v_neutral.wickets, 2)}×)`]);
  }
  const name = v.venue.name || v.venue.id;
  return frame(t, name, `${v.format} · ${v.character} · v neutral ground`, bars(t, rows, 40, 420, 150, 70, t.b), watermark);
}

export function trend_card(tr: Row, theme = "dark", watermark = false): string {
  const t = th(theme);
  const rows: Row[] = tr.seasons;
  if (!rows || !rows.length) return frame(t, "Scoring trend", tr.format, "", watermark);
  const x0 = 90, y0 = 150, w = W - 170, h = 380;
  const phases = ["powerplay", "middle", "death"];
  const vals = rows.flatMap((x) => phases.map((ph) => x[ph].runs_per_over || 0));
  const lo = Math.min(...vals) - 0.5, hi = Math.max(...vals) + 0.5;
  const cols = [t.a, t.b, t.muted];
  const span = Math.max(rows.length - 1, 1);
  let body = "";
  phases.forEach((ph, k) => {
    const pts = rows.map((x, i) => [x0 + w * i / span, y0 + h - h * ((x[ph].runs_per_over || 0) - lo) / (hi - lo)]);
    body += `<path d='${pts.map(([x, y], i) => (i === 0 ? "M" : "L") + `${f(x, 1)},${f(y, 1)}`).join(" ")}' ` +
      `fill='none' stroke='${cols[k]}' stroke-width='4'/>`;
    body += `<text x='${x0 + k * 300}' y='${y0 + h + 80}' fill='${cols[k]}' font-size='24' ${FONT}>` +
      `${ph[0].toUpperCase() + ph.slice(1)}: ${f(rows[rows.length - 1][ph].runs_per_over, 2)} an over</text>`;
  });
  const every = Math.max(1, Math.floor(rows.length / 8));
  rows.forEach((x, i) => {
    if (i % every === 0 || i === rows.length - 1) {
      body += `<text x='${f(x0 + w * i / span, 1)}' y='${y0 + h + 30}' text-anchor='middle' ` +
        `fill='${t.muted}' font-size='16' ${FONT}>${x.season}</text>`;
    }
  });
  return frame(t, "Scoring trend", `${tr.format} · runs per over by phase, average batter v average attack`, body, watermark);
}

export const CARDS: Record<string, (doc: Row, theme?: string, watermark?: boolean) => string> = {
  win: win_card, scores: scores_card, worm: worm_card, phases: phases_card, duels: duels_card,
};
