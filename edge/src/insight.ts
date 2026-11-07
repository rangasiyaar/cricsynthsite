// Model-only analytics from the published analytics kit: a TypeScript port of cricmcp/insight.py (itself a port of
// cricsim/engine/insight.py), same arithmetic, names and shapes. cricmcp/tests/test_edge_parity.py checks the two.
// "Average" means the ball-weighted average player in the same format, so 1.00 = typical.
import { maxBy, mean, minBy, r, round, sum } from "./py.ts";

export const PHASES = ["powerplay", "middle", "death"] as const;
export type Player = Record<string, any>;
type Row = Record<string, any>;

const add = (...vs: number[][]): number[] => vs[0].map((_, i) => { let s = 0; for (const v of vs) s += v[i]; return s; });

export class Kit {
  c: Row; K: number;
  DOT: number; FOUR: number; SIX: number; WKT: number; WIDE: number; NOBALL: number; BYE: number;
  runs: number[]; legal: boolean[]; kinds: string[]; hands: string[];

  constructor(ctx: Row) {
    this.c = ctx;
    const o: string[] = ctx.outcomes;
    this.K = o.length;
    this.DOT = o.indexOf("0"); this.FOUR = o.indexOf("4"); this.SIX = o.indexOf("6"); this.WKT = o.indexOf("W");
    this.WIDE = o.indexOf("WD"); this.NOBALL = o.indexOf("NB"); this.BYE = o.indexOf("BYE");
    this.runs = ctx.bat_runs; this.legal = ctx.legal;
    this.kinds = ctx.bowling_kinds; this.hands = ctx.hands;
  }

  // ── context ──
  static fam(fmt: string): number { return fmt === "OD" ? 1 : 0; }
  sit(fmt: string, gender: string, key: string): number[] { return this.c.situations[`${fmt}:${gender}`][key]; }
  F(fmt: string): Row { return this.c.families[Kit.fam(fmt)]; }

  // ── players ──
  /** A player the kit doesn't cover: simulated as the league-average newcomer, as the API does. */
  static stub(pid: string): Player {
    return { id: pid, name: pid, known: false, hand: "unknown", bowling_kind: "unknown", gender: null,
             balls_faced: [0, 0], balls_bowled: [0, 0] };
  }

  batter(p: Player | null | undefined, fmt: string): [number[], number[][], number | null] {
    const F = this.F(fmt);
    if (p == null || p.known === false) return [F.avg_bat, F.avg_bat_kind, null];
    return [p.bat[Kit.fam(fmt)], p.bat_kind, this.hands.indexOf(p.hand)];
  }

  bowler(p: Player | null | undefined, fmt: string): [number[], number[][], number | null] {
    const F = this.F(fmt);
    if (p == null || p.known === false) return [F.avg_bowl, F.avg_bowl_hand, null];
    return [p.bowl[Kit.fam(fmt)], p.bowl_hand, this.kinds.indexOf(p.bowling_kind)];
  }

  /** Outcome probabilities, mixing over bowling types / batting hands when they're not fixed (Ctx.probs). */
  probs(fmt: string, sit: number[], o: { batter?: Player | null; bowler?: Player | null; kind?: number | null;
        hand?: number | null } = {}): number[] {
    const F = this.F(fmt);
    const [b, bk, bhand] = this.batter(o.batter, fmt);
    const [w, wh, wkind] = this.bowler(o.bowler, fmt);
    const hand = o.hand ?? null, kind = o.kind ?? null;
    const hands: [number, number][] = (hand !== null || bhand) ? [[hand !== null ? hand : bhand!, 1.0]]
      : (F.hand_share as number[]).map((s, h) => [h, s] as [number, number]).filter(([, s]) => s > 0);
    const kinds: [number, number][] = (kind !== null || wkind) ? [[kind !== null ? kind : wkind!, 1.0]]
      : (F.kind_share as number[]).map((s, k) => [k, s] as [number, number]).filter(([, s]) => s > 0);
    const out = new Array(this.K).fill(0);
    for (const [h, hs] of hands) {
      for (const [k, ks] of kinds) {
        const L = add(sit, b, w, bk[k], wh[h], F.hand_kind[h][k]);
        const mx = Math.max(...L);
        const e = L.map((x) => Math.exp(x - mx));
        const s = sum(e);
        for (let i = 0; i < this.K; i++) out[i] += hs * ks * e[i] / s;
      }
    }
    const t = sum(out);
    return out.map((x) => x / t);
  }

  private legalSum(q: number[]): number { let s = 0; q.forEach((x, i) => { if (this.legal[i]) s += x; }); return s; }
  private runSum(q: number[]): number { let s = 0; q.forEach((x, i) => { s += x * this.runs[i]; }); return s; }

  batting(q: number[]): Row {
    const faced = this.legalSum(q), runs = this.runSum(q), w = q[this.WKT];
    return { strike_rate: r(100 * runs / faced, 1), balls_per_dismissal: w ? r(faced / w, 1) : null,
             runs_per_dismissal: w ? r(runs / w, 1) : null, dot_pct: r(100 * q[this.DOT] / faced, 1),
             boundary_pct: r(100 * (q[this.FOUR] + q[this.SIX]) / faced, 1), six_pct: r(100 * q[this.SIX] / faced, 2) };
  }

  bowling(q: number[], fmt: string): Row {
    const F = this.F(fmt);
    const legal = this.legalSum(q);
    const conceded = this.runSum(q) + q[this.WIDE] * (1 + F.wide) + q[this.NOBALL] + q[this.BYE] * F.bye;
    const w = q[this.WKT];
    return { economy: r(6 * conceded / legal, 2), balls_per_wicket: w ? r(legal / w, 1) : null,
             dot_pct: r(100 * q[this.DOT] / legal, 1), boundary_pct: r(100 * (q[this.FOUR] + q[this.SIX]) / legal, 1),
             extras_per_over: r(6 * (q[this.WIDE] + q[this.NOBALL]) / legal, 2) };
  }

  // ── read-outs (same names and shapes as cricsim.engine.insight) ──
  static who(p: Player): Row {
    return { id: p.id, name: p.name, known: p.known ?? true, hand: p.hand, bowling_kind: p.bowling_kind,
             gender: p.gender ?? null };
  }

  static index(me: Row, avg: Row): Row {
    const out: Row = {};
    for (const k of Object.keys(me)) out[k] = me[k] && avg[k] ? r(me[k] / avg[k], 2) : null;
    return out;
  }

  experience(p: Player, fam: number): Row {
    const balls = p.balls_faced[fam] + p.balls_bowled[fam];
    return { balls_faced: r(p.balls_faced[fam], 0), balls_bowled: r(p.balls_bowled[fam], 0),
             confidence: balls >= 1500 ? "high" : balls >= 400 ? "medium" : "low" };
  }

  phase_profile(p: Player, fmt = "T20", gender = "male"): Row {
    const out: Row = { player: Kit.who(p), format: fmt, batting: {}, bowling: {} };
    for (const ph of PHASES) {
      const s = this.sit(fmt, gender, `phase:${ph}`);
      let me = this.batting(this.probs(fmt, s, { batter: p })), avg = this.batting(this.probs(fmt, s));
      out.batting[ph] = { ...me, v_average: Kit.index(me, avg) };
      me = this.bowling(this.probs(fmt, s, { bowler: p }), fmt); avg = this.bowling(this.probs(fmt, s), fmt);
      out.bowling[ph] = { ...me, v_average: Kit.index(me, avg) };
    }
    out.experience = this.experience(p, Kit.fam(fmt));
    return out;
  }

  vs_bowling(p: Player, fmt = "T20", gender = "male", phase = "middle"): Row {
    const s = this.sit(fmt, gender, `phase:${phase}`);
    const rows: Row[] = [];
    this.kinds.forEach((name, k) => {
      if (k === 0 || name === "slow") return;
      const me = this.batting(this.probs(fmt, s, { batter: p, kind: k })), avg = this.batting(this.probs(fmt, s, { kind: k }));
      rows.push({ bowling_kind: name, ...me, v_average_batter: Kit.index(me, avg) });
    });
    const best = maxBy(rows, (x) => x.v_average_batter.balls_per_dismissal || 0);
    const worst = minBy(rows, (x) => x.v_average_batter.balls_per_dismissal || 9);
    return { player: Kit.who(p), format: fmt, phase, by_bowling_kind: rows, strongest_against: best.bowling_kind,
             weakest_against: worst.bowling_kind, experience: this.experience(p, Kit.fam(fmt)) };
  }

  vs_batting_hand(p: Player, fmt = "T20", gender = "male", phase = "middle"): Row {
    const s = this.sit(fmt, gender, `phase:${phase}`);
    const rows = [1, 2].map((h) => {
      const me = this.bowling(this.probs(fmt, s, { bowler: p, hand: h }), fmt);
      const avg = this.bowling(this.probs(fmt, s, { hand: h }), fmt);
      return { batting_hand: this.hands[h], ...me, v_average_bowler: Kit.index(me, avg) };
    });
    return { player: Kit.who(p), format: fmt, phase, by_batting_hand: rows, experience: this.experience(p, Kit.fam(fmt)) };
  }

  situations(p: Player, fmt = "T20", gender = "male"): Row {
    const rows = (prefix: string, labels: string[], key: string) => labels.map((lab) => {
      const s = this.sit(fmt, gender, `${prefix}:${lab}`);
      const me = this.batting(this.probs(fmt, s, { batter: p })), avg = this.batting(this.probs(fmt, s));
      return { [key]: lab, ...me, v_average: Kit.index(me, avg) };
    });
    return { player: Kit.who(p), format: fmt, at_the_crease: rows("crease", this.c.crease, "stage"),
             chasing: rows("chase", this.c.chase, "situation"), experience: this.experience(p, Kit.fam(fmt)) };
  }

  format_split(p: Player, gender = "male"): Row {
    const out: Row = { player: Kit.who(p), formats: {} };
    for (const fmt of ["T20", "OD"]) {
      const s = this.sit(fmt, gender, "phase:middle");
      const bm = this.batting(this.probs(fmt, s, { batter: p })), ba = this.batting(this.probs(fmt, s));
      const wm = this.bowling(this.probs(fmt, s, { bowler: p }), fmt), wa = this.bowling(this.probs(fmt, s), fmt);
      out.formats[fmt] = { batting: { ...bm, v_average: Kit.index(bm, ba) }, bowling: { ...wm, v_average: Kit.index(wm, wa) },
                           experience: this.experience(p, Kit.fam(fmt)) };
    }
    return out;
  }

  role(p: Player, fmt = "T20"): Row {
    const fam = Kit.fam(fmt);
    const use: number[] = (p.usage || [new Array(10).fill(0), new Array(10).fill(0)])[fam];
    const [pp, death] = fam === 0 ? [3, 8] : [1, 8];
    const byPhase: Row = { powerplay: r(sum(use.slice(0, pp)), 2), middle: r(sum(use.slice(pp, death)), 2),
                           death: r(sum(use.slice(death)), 2) };
    const total = sum(use);
    const pos = Number((p.bat_pos || [0, 0])[fam]);
    const battingRole = pos ? (pos <= 2.5 ? "opener" : pos <= 4.5 ? "top order" : pos <= 7.5 ? "middle order" : "lower order") : null;
    let bowlingRole: string | null = null;
    if (total >= 0.5) {
      const top = maxBy(Object.keys(byPhase), (k) => byPhase[k] || 0);
      bowlingRole = (byPhase[top] || 0) / total >= 0.5 ? `${top} specialist` : "all phases";
    }
    const last = p.last_played || 0;
    return { player: Kit.who(p), format: fmt,
             batting: { average_position: pos ? r(pos, 1) : null, role: battingRole },
             bowling: { overs_per_match: r(total, 2), overs_by_phase: byPhase, role: bowlingRole,
                        by_innings_decile: use.map((x) => r(x, 2)) },
             matches_weighted: p.appearances ? r((p.appearances || [0, 0])[fam], 1) : null,
             last_played: last ? new Date(last * 86400000).toISOString().slice(0, 10) : null,
             experience: this.experience(p, fam) };
  }

  /** Where the rating comes from (summary.profile): multipliers v an average player, 1.0 = average. */
  rating(p: Player, fmt = "T20"): Row {
    const fam = Kit.fam(fmt);
    const bat = p.bat[fam], bowl = p.bowl[fam];
    const m = (v: number[], k: number) => r(Math.exp(v[k] - v[this.DOT]), 2);
    return { ...Kit.who(p), profile: {
      balls_faced: { short: r(p.balls_faced[0], 0), od: r(p.balls_faced[1], 0) },
      balls_bowled: { short: r(p.balls_bowled[0], 0), od: r(p.balls_bowled[1], 0) },
      in_this_format: r(p.balls_faced[fam] + p.balls_bowled[fam], 0),
      batting: { wicket: m(bat, this.WKT), four: m(bat, this.FOUR), six: m(bat, this.SIX) },
      bowling: { wicket: m(bowl, this.WKT), four: m(bowl, this.FOUR), six: m(bowl, this.SIX), wide: m(bowl, this.WIDE) },
      hand: p.hand, bowling_kind: p.bowling_kind } };
  }

  compare(ps: Player[], fmt = "T20", gender = "male"): Row {
    const rows = ps.map((p) => {
      const row: Row = { player: Kit.who(p), batting: {}, bowling: {}, experience: this.experience(p, Kit.fam(fmt)) };
      for (const ph of PHASES) {
        const s = this.sit(fmt, gender, `phase:${ph}`);
        row.batting[ph] = this.batting(this.probs(fmt, s, { batter: p }));
        row.bowling[ph] = this.bowling(this.probs(fmt, s, { bowler: p }), fmt);
      }
      return row;
    });
    const s = this.sit(fmt, gender, "phase:middle");
    return { format: fmt, players: rows,
             average: { batting: this.batting(this.probs(fmt, s)), bowling: this.bowling(this.probs(fmt, s), fmt) } };
  }

  private edge(fmt: string, s: number[], bat: Player, bowl: Player): Row {
    const me = this.batting(this.probs(fmt, s, { batter: bat, bowler: bowl })), base = this.batting(this.probs(fmt, s));
    return { strike_rate: me.strike_rate, balls_per_dismissal: me.balls_per_dismissal, dot_pct: me.dot_pct,
             boundary_pct: me.boundary_pct,
             wicket_edge: r((base.balls_per_dismissal || 0) / (me.balls_per_dismissal || 1), 2),
             scoring_edge: r((me.strike_rate || 0) / (base.strike_rate || 1), 2) };
  }

  matchup(bat: Player, bowl: Player, fmt = "T20", gender = "male", phase = "middle"): Row {
    const s = this.sit(fmt, gender, `phase:${phase}`);
    const q = this.probs(fmt, s, { batter: bat, bowler: bowl }), avg = this.probs(fmt, s);
    const stats = (x: number[]) => {
      const legal = this.legalSum(x), runs = this.runSum(x), w = x[this.WKT] / legal;
      return { dismissal_per_ball: round(w, 4), balls_per_dismissal: w ? round(1 / w, 1) : null,
               strike_rate: round(100 * runs / legal, 1), dot_pct: round(100 * x[this.DOT] / legal, 1),
               boundary_pct: round(100 * (x[this.FOUR] + x[this.SIX]) / legal, 1), six_pct: round(100 * x[this.SIX] / legal, 2) };
    };
    const me = stats(q), base = stats(avg);
    const perBall: Row = {};
    (this.c.outcomes as string[]).forEach((o, i) => { perBall[o] = round(q[i], 4); });
    return { batter: Kit.who(bat), bowler: Kit.who(bowl), format: fmt, phase, per_ball: perBall, matchup: me,
             average_pairing: base,
             edge: { wicket: round(me.dismissal_per_ball / base.dismissal_per_ball, 2),
                     strike_rate: round(me.strike_rate / base.strike_rate, 2) } };
  }

  matchup_grid(bats: Player[], bowls: Player[], fmt = "T20", gender = "male", phase = "middle"): Row {
    const s = this.sit(fmt, gender, `phase:${phase}`);
    return { format: fmt, phase, batters: bats.map(Kit.who), bowlers: bowls.map(Kit.who),
             cells: bats.flatMap((b) => bowls.map((w) => ({ batter: b.id, bowler: w.id, ...this.edge(fmt, s, b, w) }))),
             note: "wicket_edge > 1: the bowler is likelier than an average pairing to take the wicket; " +
                   "scoring_edge > 1: the batter scores faster than against an average bowler." };
  }

  counter(bat: Player, cands: Player[], fmt = "T20", gender = "male", phase = "middle"): Row {
    const s = this.sit(fmt, gender, `phase:${phase}`);
    const wv = this.c.wicket_runs[Kit.fam(fmt) ? "od" : "short"];
    const rows = cands.map((w) => {
      const e = this.edge(fmt, s, bat, w);
      const q = this.probs(fmt, s, { batter: bat, bowler: w });
      const value = 6 * (this.runSum(q) - wv * q[this.WKT]) / this.legalSum(q);
      return { bowler: Kit.who(w), ...e, net_runs_per_over: r(value, 2) };
    });
    rows.sort((a, b) => (a.net_runs_per_over as number) - (b.net_runs_per_over as number));
    return { batter: Kit.who(bat), format: fmt, phase, ranked: rows, best_option: rows.length ? rows[0].bowler : null };
  }

  team_profile(xi: Player[], fmt = "T20", gender = "male", bowlers: Player[] | null = null): Row {
    const fam = Kit.fam(fmt);
    const sMid = this.sit(fmt, gender, "phase:middle");
    const avgB = this.batting(this.probs(fmt, sMid));
    const spin: number[] = this.c.spin_kinds, pace: number[] = this.c.pace_kinds;
    const bpd = (o: { batter?: Player; kind?: number }) => this.batting(this.probs(fmt, sMid, o)).balls_per_dismissal || 0;
    const sa = mean(spin.map((k) => bpd({ kind: k }))), pv = mean(pace.map((k) => bpd({ kind: k })));
    const batRows: Row[] = [], spinIdx: number[] = [], paceIdx: number[] = [];
    xi.forEach((p, i) => {
      const pos = i + 1;
      const me = this.batting(this.probs(fmt, sMid, { batter: p }));
      if (pos <= 7) {
        const sp = mean(spin.map((k) => bpd({ batter: p, kind: k }))), pa = mean(pace.map((k) => bpd({ batter: p, kind: k })));
        spinIdx.push(sa ? sp / sa : 1);
        paceIdx.push(pv ? pa / pv : 1);
      }
      batRows.push({ position: pos, ...Kit.who(p), ...me, v_average: Kit.index(me, avgB) });
    });
    const overs = (p: Player) => sum((p.usage || [new Array(10).fill(0), new Array(10).fill(0)])[fam]);
    const pool = bowlers && bowlers.length ? bowlers : xi.filter((p) => overs(p) >= 0.5);
    const bowlRows = pool.map((p) => {
      const row: Row = { ...Kit.who(p), overs_per_match: r(overs(p), 2) };
      for (const ph of PHASES) row[ph] = this.bowling(this.probs(fmt, this.sit(fmt, gender, `phase:${ph}`), { bowler: p }), fmt);
      return row;
    });
    const kinds = pool.map((p) => p.bowling_kind);
    const top7 = batRows.filter((x) => x.position <= 7);
    const spinNames = new Set(spin.map((i) => this.kinds[i]));
    return { format: fmt, batting: batRows, bowling: bowlRows,
             summary: { top7_strike_rate: r(mean(top7.map((x) => x.strike_rate || 0)), 1),
                        top7_balls_per_dismissal: r(mean(top7.map((x) => x.balls_per_dismissal || 0)), 1),
                        left_handers_top7: xi.slice(0, 7).filter((p) => p.hand === "left").length,
                        spin_options: kinds.filter((k) => spinNames.has(k)).length,
                        pace_options: kinds.filter((k) => k === "pace_right" || k === "pace_left").length,
                        survival_v_spin: spinIdx.length ? r(mean(spinIdx), 2) : null,
                        survival_v_pace: paceIdx.length ? r(mean(paceIdx), 2) : null,
                        bowling_depth: pool.length },
             note: "survival_v_spin / v_pace: top-seven balls per dismissal against that bowling type relative " +
                   "to average batters (above 1 = harder to dismiss)." };
  }
}
