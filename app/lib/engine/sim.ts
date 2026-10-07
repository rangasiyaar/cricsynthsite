// Browser port of cricsim/engine/simulate.py — keep the two in step (tests/parity.test.ts checks it).
// One simulation at a time, ball by ball, using the engine pack published with each match.

export type Pack = {
  version: number; format: string; gender: string;
  rules: { overs: number; pp: number; quota: number; bpo: number };
  outcomes: string[]; batRuns: number[]; legal: boolean[]; battingClasses: number[];
  edges: { set: number[]; chase: number[]; mile: number[]; dots: number[] };
  base: number[][][][];                      // [innings0][over][wickets][K]
  situation: Record<"set" | "chase" | "mile" | "streak" | "dots" | "spell" | "freehit", number[][]>;
  batting: { team: number; order: string[]; bowlers: string[]; pair: number[][][]; bowlWeights: number[][];
             dismissal: number[][]; bowlerKinds: string[] }[];
  wideRuns: number[]; byeRuns: number[]; runoutNonStriker: number;
  dismissals: string[]; bowlerDismissals: boolean[]; runOut: number;
  conditionsSd: { boundary?: number; wicket?: number };
  teams: { name: string; players: string[] }[];
  players: Record<string, { name: string; known: boolean; hand: string }>;
};

export type StartState = {
  innings: 1 | 2; runs: number; wickets: number; balls: number; firstInningsTotal?: number;
  striker?: string; nonStriker?: string; out?: string[];
};

export type Scenario = {
  boundaryMult?: number; wicketMult?: number; spinWicketMult?: number; paceWicketMult?: number;
  dew?: number; extrasMult?: number; playerForm?: Record<string, number>; excludeBowlers?: string[];
  battingFirst?: 0 | 1 | null; target?: number; conditions?: boolean; start?: StartState;
};

const K = 10;
const [DOT, ONE, TWO, THREE, FOUR, SIX, WKT, WIDE, NOBALL, BYE] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const SPIN = new Set(["off_spin", "leg_spin", "left_arm_orthodox", "left_arm_wrist", "slow"]);
const PACE = new Set(["pace_right", "pace_left"]);
const PLAN_WEIGHT = 0.01;   // simulate.py PLAN_WEIGHT

export function rng(seed: number) {                       // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(r: () => number) {
  const u = Math.max(r(), 1e-12), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function choose(r: () => number, w: ArrayLike<number>, n = w.length): number {
  let tot = 0;
  for (let i = 0; i < n; i++) tot += w[i];
  let u = r() * tot;
  for (let i = 0; i < n; i++) { u -= w[i]; if (u < 0) return i; }
  return n - 1;
}

const bucket = (edges: number[], x: number) => { let i = 0; while (i < edges.length && x >= edges[i]) i++; return i; };

export type InningsResult = {
  runs: number; wkts: number; legal: number; extras: [number, number, number];
  overRuns: Int16Array; overWkts: Int8Array;
  batRuns: Int16Array; batBalls: Int16Array; batOut: Uint8Array; batKind: Int8Array; batBy: Int8Array;
  bowlBalls: Int16Array; bowlRuns: Int16Array; bowlWkts: Int8Array;
  fowBall: Int16Array; fowBowler: Int8Array; fowSlot: Int8Array;
};

type Prepared = { pair: Float64Array; weights: number[][]; dismissal: number[][]; kinds: string[];
                  order: string[]; bowlers: string[] };

/** Apply scenario levers to the neutral pair table — mirrors _Tables in simulate.py. */
export function prepare(pack: Pack, battingTeam: number, inn0: number, sc: Scenario): Prepared {
  const b = pack.batting.find((x) => x.team === battingTeam)!;
  const pair = new Float64Array(11 * 11 * K);
  const lb = Math.log(sc.boundaryMult ?? 1), lw = Math.log(sc.wicketMult ?? 1), le = Math.log(sc.extrasMult ?? 1);
  const dew = sc.dew ?? 0;
  for (let i = 0; i < 11; i++) for (let j = 0; j < 11; j++) {
    const o = (i * 11 + j) * K;
    for (let k = 0; k < K; k++) pair[o + k] = b.pair[i][j][k];
    pair[o + FOUR] += lb; pair[o + SIX] += lb; pair[o + WKT] += lw;
    pair[o + WIDE] += le; pair[o + NOBALL] += le; pair[o + BYE] += le;
    const kind = b.bowlerKinds[j];
    if (SPIN.has(kind)) pair[o + WKT] += Math.log(sc.spinWicketMult ?? 1) + (inn0 === 1 ? Math.log(1 - 0.3 * dew) : 0);
    if (PACE.has(kind)) pair[o + WKT] += Math.log(sc.paceWicketMult ?? 1);
    if (inn0 === 1 && dew) { pair[o + FOUR] += Math.log(1 + 0.1 * dew); pair[o + SIX] += Math.log(1 + 0.1 * dew); }
    const fb = sc.playerForm?.[b.order[i]];
    if (fb) { const l = Math.log(fb); pair[o + WKT] -= l; pair[o + FOUR] += 0.5 * l; pair[o + SIX] += 0.5 * l; }
    const fw = sc.playerForm?.[b.bowlers[j]];
    if (fw) { const l = Math.log(fw); pair[o + WKT] += l; pair[o + FOUR] -= 0.5 * l; pair[o + SIX] -= 0.5 * l; }
  }
  const excluded = new Set(sc.excludeBowlers ?? []);
  let weights = b.bowlWeights.map((row, j) => (excluded.has(b.bowlers[j]) ? row.map(() => 0) : row));
  if (weights.every((row) => row.every((v) => v === 0))) weights = b.bowlWeights;
  return { pair, weights, dismissal: b.dismissal, kinds: b.bowlerKinds, order: b.order, bowlers: b.bowlers };
}

export function simulateInnings(pack: Pack, P: Prepared, inn0: number, target: number | null, r: () => number,
                                cond: Float64Array, start?: StartState): InningsResult {
  const { overs, bpo, quota } = pack.rules;
  const consecutiveOk = bpo === 5;
  const sit = pack.situation, base = pack.base[inn0];
  const res: InningsResult = {
    runs: 0, wkts: 0, legal: 0, extras: [0, 0, 0], overRuns: new Int16Array(overs), overWkts: new Int8Array(overs),
    batRuns: new Int16Array(11), batBalls: new Int16Array(11), batOut: new Uint8Array(11),
    batKind: new Int8Array(11).fill(-1), batBy: new Int8Array(11).fill(-1),
    bowlBalls: new Int16Array(11), bowlRuns: new Int16Array(11), bowlWkts: new Int8Array(11),
    fowBall: new Int16Array(10).fill(-1), fowBowler: new Int8Array(10).fill(-1), fowSlot: new Int8Array(10).fill(-1),
  };
  const prevRuns = new Int16Array(11).fill(-1), prevBnd = new Uint8Array(11);
  const lastOver = new Int16Array(11).fill(-9), used = new Int16Array(11);
  let striker = 0, non = 1, queue = [2, 3, 4, 5, 6, 7, 8, 9, 10], qpos = 0;
  if (start) {
    const idx = new Map(P.order.map((p, i) => [p, i]));
    const outSlots = (start.out ?? []).map((p) => idx.get(p)).filter((x): x is number => x !== undefined);
    outSlots.forEach((s) => (res.batOut[s] = 1));
    const remaining = [...Array(11).keys()].filter((i) => !outSlots.includes(i));
    striker = idx.get(start.striker ?? "") ?? remaining[0];
    non = idx.get(start.nonStriker ?? "") ?? remaining.find((i) => i !== striker)!;
    queue = remaining.filter((i) => i !== striker && i !== non);
    res.runs = start.runs; res.wkts = start.wickets; res.legal = start.balls;
  }
  // bowling plan for this innings (mirrors PLAN_WEIGHT in simulate.py)
  const plan = P.weights.map((row) => r() < Math.min(1, row.reduce((a, v) => a + v, 0) / row.length / PLAN_WEIGHT));
  let inOver = res.legal % bpo, bowler = -1, spell = 0, freeHit = 0, dots = 0;
  const L = new Float64Array(K), w = new Float64Array(11);
  const maxBalls = overs * bpo;
  while (res.wkts < 10 && res.legal < maxBalls && striker < 11 && non < 11 && (target === null || res.runs < target)) {
    const ov = Math.min(Math.floor(res.legal / bpo), overs - 1);
    if (bowler < 0 || (inOver === 0 && lastOver[bowler] !== ov)) {
      const dec = Math.min(Math.floor((ov * 10) / overs), 9);
      let any = 0;
      for (let pass = 0; pass < 2 && any === 0; pass++) {     // plan exhausted → anyone else who may bowl
        for (let j = 0; j < 11; j++) {
          w[j] = used[j] < quota && (consecutiveOk || j !== bowler) && (pass === 1 || plan[j]) ? P.weights[j][dec] : 0;
          any += w[j];
        }
      }
      if (any === 0) for (let j = 0; j < 11; j++) w[j] = (used[j] < quota ? 1 : 0) + 1e-9;
      const b = choose(r, w, 11);
      spell = lastOver[b] < ov - 2 ? 1 : 0;
      bowler = b; lastOver[b] = ov; used[b]++;
    }
    const st = striker, bw = bowler;
    const sb = bucket(pack.edges.set, res.batBalls[st]);
    const cb = inn0 === 1 && target !== null
      ? bucket(pack.edges.chase, (6 * (target - res.runs)) / Math.max(maxBalls - res.legal, 1)) + 1 : 0;
    const mb = bucket(pack.edges.mile, res.batRuns[st]);
    const pr = prevRuns[st];
    const stb = pr < 0 ? 0 : prevBnd[st] && pr === 4 ? 3 : prevBnd[st] && pr === 6 ? 4 : pr === 0 ? 1 : 2;
    const db = bucket(pack.edges.dots, dots);
    const bs = base[ov][Math.min(res.wkts, 9)], po = (st * 11 + bw) * K;
    let mx = -Infinity;
    for (let k = 0; k < K; k++) {
      L[k] = bs[k] + sit.set[sb][k] + sit.chase[cb][k] + sit.mile[mb][k] + sit.streak[stb][k] + sit.dots[db][k]
        + sit.spell[spell][k] + sit.freehit[freeHit][k] + P.pair[po + k] + cond[k];
      if (L[k] > mx) mx = L[k];
    }
    for (let k = 0; k < K; k++) L[k] = Math.exp(L[k] - mx);
    const y = choose(r, L, K);
    const fhNow = freeHit === 1;
    freeHit = 0;
    let batR = pack.batRuns[y], ext = 0;
    if (y === NOBALL) {
      const cls = pack.battingClasses;
      const sub = choose(r, cls.map((c) => L[c]));
      batR = pack.batRuns[cls[sub]];
      freeHit = 1; ext = 1; res.extras[1] += 1;
    } else if (y === WIDE) {
      ext = 1 + choose(r, pack.wideRuns); res.extras[0] += ext;
    } else if (y === BYE) {
      ext = 1 + choose(r, pack.byeRuns); res.extras[2] += ext;
    }
    const total = batR + ext, legal = y !== WIDE && y !== NOBALL, faced = y !== WIDE;
    res.runs += total; res.overRuns[ov] += total;
    res.batRuns[st] += batR;
    if (faced) { res.batBalls[st] += 1; prevRuns[st] = batR; prevBnd[st] = batR >= 4 ? 1 : 0; }
    res.bowlRuns[bw] += batR + (y === WIDE || y === NOBALL ? ext : 0);
    if (legal) res.bowlBalls[bw] += 1;
    dots = legal && total === 0 ? dots + 1 : 0;
    if (y === WKT) {
      let kind = choose(r, P.dismissal[bw]);
      if (fhNow) kind = pack.runOut;
      const nsOut = kind === pack.runOut && r() < pack.runoutNonStriker;
      const outSlot = nsOut ? non : striker;
      const credited = pack.bowlerDismissals[kind] ? bw : -1;
      res.batOut[outSlot] = 1; res.batKind[outSlot] = kind; res.batBy[outSlot] = credited;
      if (credited >= 0) res.bowlWkts[credited] += 1;
      res.fowBall[res.wkts] = res.legal + 1; res.fowBowler[res.wkts] = credited; res.fowSlot[res.wkts] = outSlot;
      res.wkts += 1; res.overWkts[ov] += 1;
      const nb = qpos < queue.length ? queue[qpos] : 11;
      qpos++;
      if (outSlot === striker) striker = nb; else non = nb;
    } else {
      const ran = batR + (y === BYE ? ext : y === WIDE ? ext - 1 : 0);
      if (ran % 2 === 1) [striker, non] = [non, striker];
    }
    if (legal) {
      res.legal += 1; inOver += 1;
      if (inOver === bpo) { inOver = 0; [striker, non] = [non, striker]; }
    }
  }
  return res;
}

export type MatchSim = { battingFirst: number; innings: [InningsResult, InningsResult]; winner: number; tie: boolean };

/** n full matches. battingFirst null = half each way (unknown toss). */
export function simulateMatches(pack: Pack, n: number, sc: Scenario = {}, seed = 1): MatchSim[] {
  const r = rng(seed);
  const out: MatchSim[] = [];
  const sd = sc.conditions === false ? {} : pack.conditionsSd ?? {};
  const prepared = new Map<string, Prepared>();
  const prep = (team: number, inn0: number) => {
    const key = `${team}:${inn0}`;
    if (!prepared.has(key)) prepared.set(key, prepare(pack, team, inn0, sc));
    return prepared.get(key)!;
  };
  for (let i = 0; i < n; i++) {
    const bf = sc.start ? (sc.battingFirst ?? 0) : sc.battingFirst ?? (i < n - Math.floor(n / 2) ? 0 : 1);
    const cond = new Float64Array(K);
    if (sd.boundary) { const z = -0.5 * sd.boundary ** 2 + sd.boundary * normal(r); cond[FOUR] = z; cond[SIX] = z; }
    if (sd.wicket) cond[WKT] = -0.5 * sd.wicket ** 2 + sd.wicket * normal(r);
    let first: InningsResult;
    if (sc.start && sc.start.innings === 2) {
      first = emptyInnings(pack, sc.start.firstInningsTotal ?? 0);
    } else {
      first = simulateInnings(pack, prep(bf, 0), 0, null, r, cond, sc.start);
    }
    const target = sc.target ?? first.runs + 1;
    const second = simulateInnings(pack, prep(1 - bf, 1), 1, target, r, cond,
                                   sc.start && sc.start.innings === 2 ? sc.start : undefined);
    const r1 = sc.target ? sc.target - 1 : first.runs, r2 = second.runs;
    const tie = r1 === r2;
    const winner = r2 > r1 ? 1 - bf : r1 > r2 ? bf : r() < 0.5 ? 0 : 1;
    out.push({ battingFirst: bf, innings: [first, second], winner, tie });
  }
  return out;
}

function emptyInnings(pack: Pack, total: number): InningsResult {
  const o = pack.rules.overs;
  return { runs: total, wkts: 0, legal: 0, extras: [0, 0, 0], overRuns: new Int16Array(o), overWkts: new Int8Array(o),
    batRuns: new Int16Array(11), batBalls: new Int16Array(11), batOut: new Uint8Array(11),
    batKind: new Int8Array(11).fill(-1), batBy: new Int8Array(11).fill(-1), bowlBalls: new Int16Array(11),
    bowlRuns: new Int16Array(11), bowlWkts: new Int8Array(11), fowBall: new Int16Array(10).fill(-1),
    fowBowler: new Int8Array(10).fill(-1), fowSlot: new Int8Array(10).fill(-1) };
}
