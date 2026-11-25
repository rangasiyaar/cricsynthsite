// MatchSynth Lab: the levers, ready-made scenarios (presets), share links and the "what moved it" breakdown.
// Presets are built for each match from its own data (teams, batting orders, bowling types, the published par). They
// talk about the match (conditions, parts of the order, types of bowler, the state of the game), never one player. A preset only sets its own levers, on top of whatever is set
// already, so they stack: "Heavy dew" + "Openers fire" + "Chase in trouble". Reset clears everything.
import type { Pack } from "@/lib/engine/sim";
import type { Summary } from "@/lib/types";

export type Levers = {
  battingFirst: "" | "0" | "1"; boundary: number; wickets: number; spin: number; pace: number; dew: number;
  form: Record<string, number>; exclude: string[];
  useSituation: boolean; innings: 1 | 2; runs: number; wkts: number; overs: number; firstTotal: number;
};
export const DEFAULT: Levers = { battingFirst: "", boundary: 1, wickets: 1, spin: 1, pace: 1, dew: 0, form: {}, exclude: [],
                                 useSituation: false, innings: 1, runs: 50, wkts: 2, overs: 8, firstTotal: 170 };

export type PresetGroup = "Pitch" | "Weather" | "Toss" | "Batting" | "Bowling" | "Situations";
export const PRESET_GROUPS: PresetGroup[] = ["Pitch", "Weather", "Toss", "Batting", "Bowling", "Situations"];
export type Preset = { id: string; group: PresetGroup; title: string; blurb: string; set: Partial<Levers> };

const SPIN = new Set(["off_spin", "leg_spin", "left_arm_orthodox", "left_arm_wrist", "slow"]);
const PACE = new Set(["pace_right", "pace_left"]);

/** Every preset for this match. Player presets use the published forecast to find each side's main batter and bowler. */
export function buildPresets(pack: Pack, base: Summary | null): Preset[] {
  const teams = pack.teams.map((t) => t.name);
  const orderOf = (k: number) => pack.batting.find((b) => b.team === k)?.order ?? [];
  // team k's bowlers sit in the innings where the other side bats
  const attack = (k: number) => {
    const b = pack.batting.find((x) => x.team === 1 - k);
    if (!b) return [] as { id: string; kind: string; weight: number }[];
    return b.bowlers.map((id, j) => ({ id, kind: b.bowlerKinds[j], weight: (b.bowlWeights[j] ?? []).reduce((x, y) => x + y, 0) }))
      .filter((x) => x.weight > 0.5);
  };
  const pick = (ids: string[], f: number) => Object.fromEntries(ids.filter(Boolean).map((id) => [id, f]));
  const median = (k: number) => base?.teams[k]?.batting.score.q["50"] ?? 0;
  const par = Math.round((median(0) + median(1)) / 2) || (pack.rules.overs >= 50 ? 270 : pack.rules.overs >= 20 ? 165 : 110);
  const O = pack.rules.overs, PP = pack.rules.pp || Math.round(O * 0.3);
  const at = (share: number) => Math.max(1, Math.min(O - 1, Math.round(O * share)));
  const star = (k: number) => {
    const rows = base?.teams[k]?.players ?? [];
    const bowl = [...rows].filter((p) => (p.bowling?.p_bowls ?? 0) > 0.25).sort((a, b) => (b.bowling?.wickets.mean ?? 0) - (a.bowling?.wickets.mean ?? 0))[0];
    return { bowl: bowl?.id };
  };

  const ov = (o: number) => `${o} ${o === 1 ? "over" : "overs"}`;
  const ballsLeft = (o: number) => (O - o) * pack.rules.bpo;
  const chase = (t: number, r: number, w: number, o: number) => {
    const need = t + 1 - r, b2 = ballsLeft(o);
    return `Chasing ${t + 1}: ${r}/${w} after ${ov(o)}. Needs ${need} off ${b2} balls (${(need / (b2 / pack.rules.bpo)).toFixed(1)} an over).`;
  };

  const out: Preset[] = [
    // ── the pitch and the ground
    { id: "flat", group: "Pitch", title: "Flat deck", blurb: "Boundary rate up 25%, wicket chance down 15%. Par rises and few totals are safe.", set: { boundary: 1.25, wickets: 0.85 } },
    { id: "small", group: "Pitch", title: "Short boundaries", blurb: "Boundary rate up 30%. Mistimed shots still clear the rope, and spin gets expensive.", set: { boundary: 1.3 } },
    { id: "big", group: "Pitch", title: "Long boundaries", blurb: "Boundary rate down 15%. More twos and threes, fewer sixes, and a lower par.", set: { boundary: 0.85 } },
    { id: "slow", group: "Pitch", title: "Slow and low", blurb: "Boundary rate down 18%, wicket chance up 5%. Hard to time the ball: more dots, a below-par total.", set: { boundary: 0.82, wickets: 1.05 } },
    { id: "twopaced", group: "Pitch", title: "Two-paced pitch", blurb: "Boundary rate down 10%, wicket chance up 15%. New batters take time to settle.", set: { boundary: 0.9, wickets: 1.15 } },
    { id: "green", group: "Pitch", title: "Green tinge", blurb: "Seam wickets up 45%, all wickets up 15%, boundaries down 8%. The new ball decides it.", set: { pace: 1.45, wickets: 1.15, boundary: 0.92 } },
    { id: "turner", group: "Pitch", title: "Rank turner", blurb: "Spin wickets up 55%, wickets up 10%, boundaries down 12%. The middle overs decide it.", set: { spin: 1.55, wickets: 1.1, boundary: 0.88 } },
    { id: "grip", group: "Pitch", title: "Gripping surface", blurb: "Spin wickets up 25%, boundaries down 10%. Spin is hard to score off rather than hard to survive.", set: { spin: 1.25, boundary: 0.9 } },
    { id: "sporting", group: "Pitch", title: "Balanced pitch", blurb: "Seam and spin wickets both up 15%. Bowlers stay in the game in both innings.", set: { pace: 1.15, spin: 1.15 } },
    { id: "bounce", group: "Pitch", title: "Pace and bounce", blurb: "Seam wickets up 25%, boundaries up 10%. True bounce pays the batters and the quicks alike.", set: { pace: 1.25, boundary: 1.1 } },
    // ── weather and the time of day
    { id: "overcast", group: "Weather", title: "Overcast", blurb: "Seam wickets up 35%, all wickets up 10%. Early wickets are likely, so the powerplay carries more weight.", set: { pace: 1.35, wickets: 1.1 } },
    { id: "hot", group: "Weather", title: "Hot and dry", blurb: "Boundary rate up 10%, spin wickets up 15%. Runs come early, spin later.", set: { boundary: 1.1, spin: 1.15 } },
    { id: "humid", group: "Weather", title: "Humid night", blurb: "Seam wickets up 20%, moderate dew in the second innings. Swing early, easier batting late.", set: { pace: 1.2, dew: 0.5 } },
    { id: "dew", group: "Weather", title: "Heavy dew", blurb: "Wet ball in the second innings: spin wickets fall, boundaries come easier. The chasing side gains.", set: { dew: 1 } },
    { id: "dewlight", group: "Weather", title: "Light dew", blurb: "Some moisture late on. A smaller lift for the chasing side.", set: { dew: 0.5 } },
    { id: "runfest", group: "Weather", title: "High-scoring night", blurb: "Boundary rate up 20%, wicket chance down 10%, heavy dew. Totals rise on both sides.", set: { boundary: 1.2, wickets: 0.9, dew: 0.8 } },
  ];

  // ── the toss
  teams.forEach((t, k) => out.push({ id: `bat${k}`, group: "Toss", title: `${t} bat first`, blurb: `${t} set the target. Compare it with the toss left open to see what the toss is worth.`, set: { battingFirst: String(k) as "0" | "1" } }));
  teams.forEach((t, k) => out.push({ id: `chasedew${k}`, group: "Toss", title: `${t} chase with dew`, blurb: `${teams[1 - k]} bat first, ${t} chase with heavy dew. The usual reason to bowl first at night.`, set: { battingFirst: String(1 - k) as "0" | "1", dew: 0.8 } }));
  teams.forEach((t, k) => out.push({ id: `defturn${k}`, group: "Toss", title: `${t} bat first, pitch wears`, blurb: `${t} bat first and spin wickets rise 30% as the surface breaks up.`, set: { battingFirst: String(k) as "0" | "1", spin: 1.3 } }));

  // ── batting, by part of the order (no names: these are about the match, not one player)
  teams.forEach((t, k) => {
    const o = orderOf(k);
    if (o.length >= 2) out.push({ id: `open${k}`, group: "Batting", title: `${t}: openers fire`, blurb: "Both openers in form (+35%). Fewer early wickets and a faster powerplay.", set: { form: pick(o.slice(0, 2), 1.35) } });
    if (o.length >= 3) out.push({ id: `collapse${k}`, group: "Batting", title: `${t}: top order fails`, blurb: "Nos. 1 to 3 out of form (−35%). Early wickets, and the middle order comes in sooner.", set: { form: pick(o.slice(0, 3), 0.65) } });
    if (o.length >= 6) out.push({ id: `middle${k}`, group: "Batting", title: `${t}: middle order wobbles`, blurb: "Nos. 4 to 6 out of form (−30%). The innings stalls after the powerplay.", set: { form: pick(o.slice(3, 6), 0.7) } });
    if (o.length >= 7) out.push({ id: `finish${k}`, group: "Batting", title: `${t}: finishers fire`, blurb: "Nos. 5 to 7 in form (+35%). The death overs go big.", set: { form: pick(o.slice(4, 7), 1.35) } });
    if (o.length >= 11) out.push({ id: `tail${k}`, group: "Batting", title: `${t}: tail wags`, blurb: "Nos. 8 to 11 in form (+45%). The lower order adds runs at the end.", set: { form: pick(o.slice(7, 11), 1.45) } });
    if (o.length >= 11) out.push({ id: `deep${k}`, group: "Batting", title: `${t}: whole line-up in form`, blurb: "All 11 batters at +20%. A strong batting day from top to bottom.", set: { form: pick(o.slice(0, 11), 1.2) } });
  });

  // ── bowling, by type of bowler
  teams.forEach((t, k) => {
    const a = attack(k), s = star(k);
    const spinners = a.filter((x) => SPIN.has(x.kind)).map((x) => x.id), seamers = a.filter((x) => PACE.has(x.kind)).map((x) => x.id);
    if (seamers.length) out.push({ id: `pacefire${k}`, group: "Bowling", title: `${t}: seamers on song`, blurb: "Every seamer at +30%. More wickets, fewer boundaries off pace.", set: { form: pick(seamers, 1.3) } });
    if (spinners.length) out.push({ id: `spinfire${k}`, group: "Bowling", title: `${t}: spin controls the middle`, blurb: "Every spinner at +30%. Runs dry up between the powerplay and the death.", set: { form: pick(spinners, 1.3) } });
    if (a.length) out.push({ id: `hit${k}`, group: "Bowling", title: `${t}: attack off its lengths`, blurb: "Every bowler at −25%. Boundaries flow and wickets dry up.", set: { form: pick(a.map((x) => x.id), 0.75) } });
    if (s.bowl) out.push({ id: `injured${k}`, group: "Bowling", title: `${t} without their lead bowler`, blurb: "The leading wicket-taker in our forecast doesn't bowl. The rest share the overs.", set: { exclude: [s.bowl] } });
    if (spinners.length && spinners.length < a.length) out.push({ id: `nospin${k}`, group: "Bowling", title: `${t} go all pace`, blurb: "No spin bowled. The seamers cover every over.", set: { exclude: spinners } });
  });

  // ── match situations (the side batting first is the one already chosen, else the first team)
  const sit = (x: Partial<Levers>): Partial<Levers> => ({ useSituation: true, ...x });
  const r = (share: number) => Math.round(par * share);
  const rr = (runs: number, o: number) => (o ? (runs / o).toFixed(1) : "0");
  const reqRate = O >= 40 ? 9 : 12;
  const o70 = at(0.7), need70 = Math.max(0, par + 1 - Math.round(reqRate * (O - o70)));
  out.push(
    { id: "flyer", group: "Situations", title: "Fast powerplay", blurb: `${r(0.42)}/0 after ${ov(PP)} (${rr(r(0.42), PP)} an over). No wickets lost, so the platform is there.`, set: sit({ innings: 1, runs: r(0.42), wkts: 0, overs: PP }) },
    { id: "ppcollapse", group: "Situations", title: "Powerplay collapse", blurb: `${r(0.18)}/3 after ${ov(PP)}. Three down inside the fielding restrictions.`, set: sit({ innings: 1, runs: r(0.18), wkts: 3, overs: PP }) },
    { id: "fivedown", group: "Situations", title: "Five down early", blurb: `${r(0.26)}/5 after ${ov(at(0.35))}. The lower order has most of the innings to bat.`, set: sit({ innings: 1, runs: r(0.26), wkts: 5, overs: at(0.35) }) },
    { id: "squeeze", group: "Situations", title: "Middle-overs squeeze", blurb: `${r(0.45)}/3 after ${ov(at(0.6))} (${rr(r(0.45), at(0.6))} an over). Wickets in hand, but the rate has dropped.`, set: sit({ innings: 1, runs: r(0.45), wkts: 3, overs: at(0.6) }) },
    { id: "launch", group: "Situations", title: "Platform for the death", blurb: `${r(0.64)}/2 after ${ov(at(0.75))}. Eight wickets in hand for the last ${ov(O - at(0.75))}.`, set: sit({ innings: 1, runs: r(0.64), wkts: 2, overs: at(0.75) }) },
    { id: "rescue", group: "Situations", title: "Tail-end recovery", blurb: `${r(0.5)}/7 after ${ov(at(0.65))}. Three wickets left to bat out ${ov(O - at(0.65))}.`, set: sit({ innings: 1, runs: r(0.5), wkts: 7, overs: at(0.65) }) },
    { id: "bigtarget", group: "Situations", title: "Big chase", blurb: `Target ${r(1.2) + 1}, about 20% above par. ${(((r(1.2) + 1) / O)).toFixed(1)} an over from the first ball.`, set: sit({ innings: 2, firstTotal: r(1.2), runs: 0, wkts: 0, overs: 0 }) },
    { id: "lowtotal", group: "Situations", title: "Small total to defend", blurb: `Target ${r(0.78) + 1}, about 20% below par. The bowling side needs early wickets.`, set: sit({ innings: 2, firstTotal: r(0.78), runs: 0, wkts: 0, overs: 0 }) },
    { id: "ontrack", group: "Situations", title: "Chase ahead of the rate", blurb: chase(par, r(0.65), 2, at(0.6)), set: sit({ innings: 2, firstTotal: par, runs: r(0.65), wkts: 2, overs: at(0.6) }) },
    { id: "trouble", group: "Situations", title: "Chase in trouble", blurb: chase(par, r(0.38), 5, at(0.5)), set: sit({ innings: 2, firstTotal: par, runs: r(0.38), wkts: 5, overs: at(0.5) }) },
    { id: "rate12", group: "Situations", title: `Required rate ${reqRate}+`, blurb: chase(par, need70, 4, o70), set: sit({ innings: 2, firstTotal: par, runs: need70, wkts: 4, overs: o70 }) },
    { id: "wobble", group: "Situations", title: "Late wobble in the chase", blurb: chase(par, r(0.78), 6, at(0.75)), set: sit({ innings: 2, firstTotal: par, runs: r(0.78), wkts: 6, overs: at(0.75) }) },
    { id: "lastover", group: "Situations", title: "Final over", blurb: chase(par, par + 1 - (O >= 40 ? 10 : 12), 7, O - 1), set: sit({ innings: 2, firstTotal: par, runs: par + 1 - (O >= 40 ? 10 : 12), wkts: 7, overs: O - 1 }) },
    { id: "lastpair", group: "Situations", title: "Last wicket standing", blurb: chase(par, par - 15, 9, at(0.85)), set: sit({ innings: 2, firstTotal: par, runs: par - 15, wkts: 9, overs: at(0.85) }) },
  );
  return out;
}

/** A preset's levers on top of the current ones: form and rule-outs add up, everything else is replaced. */
export function applyPreset(l: Levers, p: Preset): Levers {
  const next: Levers = { ...l, ...p.set };
  if (p.set.form) next.form = { ...l.form, ...p.set.form };
  if (p.set.exclude) next.exclude = [...new Set([...l.exclude, ...p.set.exclude])];
  return next;
}

/** Takes a preset back off: its own levers return to normal, everything else set stays. */
export function removePreset(l: Levers, p: Preset): Levers {
  const next: Levers = { ...l };
  for (const k of Object.keys(p.set) as (keyof Levers)[]) {
    if (k === "form") next.form = Object.fromEntries(Object.entries(l.form).filter(([id]) => !(id in p.set.form!)));
    else if (k === "exclude") next.exclude = l.exclude.filter((id) => !p.set.exclude!.includes(id));
    else if (k === "useSituation") next.useSituation = false;
    else if (p.set.useSituation && k !== "battingFirst") continue;          // a situation's score fields go with it
    else (next as Record<string, unknown>)[k] = DEFAULT[k];
  }
  return next;
}

/** Whether the current levers already include everything a preset sets. */
export function presetOn(l: Levers, p: Preset): boolean {
  const keys = Object.keys(p.set) as (keyof Levers)[];
  if (keys.every((k) => k !== "form" && k !== "exclude" && JSON.stringify(p.set[k]) === JSON.stringify(DEFAULT[k]))) return false;   // changes nothing
  return (Object.keys(p.set) as (keyof Levers)[]).every((k) => {
    if (k === "form") return Object.entries(p.set.form!).every(([id, f]) => l.form[id] === f);
    if (k === "exclude") return p.set.exclude!.every((id) => l.exclude.includes(id));
    return JSON.stringify(l[k]) === JSON.stringify(p.set[k]);
  });
}

// ── share links: the changed levers, compact, in the address (#s=…). Nothing is stored on our side.
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

export function encodeLevers(l: Levers): string {
  const diff = Object.fromEntries((Object.keys(DEFAULT) as (keyof Levers)[])
    .filter((k) => JSON.stringify(l[k]) !== JSON.stringify(DEFAULT[k])).map((k) => [k, l[k]]));
  return b64(JSON.stringify(diff));
}

const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
/** Levers from a share link, checked against this match: unknown players are dropped and numbers kept in range. */
export function decodeLevers(s: string, pack: Pack): Levers | null {
  try {
    const raw = JSON.parse(unb64(s)) as Partial<Levers>;
    const playing = new Set(pack.teams.flatMap((t) => t.players));
    const O = pack.rules.overs;
    return {
      battingFirst: raw.battingFirst === "0" || raw.battingFirst === "1" ? raw.battingFirst : "",
      boundary: clamp(raw.boundary, 0.75, 1.35, 1), wickets: clamp(raw.wickets, 0.75, 1.35, 1),
      spin: clamp(raw.spin, 0.8, 1.6, 1), pace: clamp(raw.pace, 0.8, 1.6, 1), dew: clamp(raw.dew, 0, 1, 0),
      form: Object.fromEntries(Object.entries(raw.form ?? {}).filter(([p, f]) => playing.has(p) && typeof f === "number").map(([p, f]) => [p, clamp(f, 0.6, 1.5, 1)])),
      exclude: (raw.exclude ?? []).filter((p) => playing.has(p)),
      useSituation: raw.useSituation === true, innings: raw.innings === 2 ? 2 : 1,
      runs: Math.round(clamp(raw.runs, 0, 500, DEFAULT.runs)), wkts: Math.round(clamp(raw.wkts, 0, 9, DEFAULT.wkts)),
      overs: Math.round(clamp(raw.overs, 0, O - 1, Math.min(DEFAULT.overs, O - 1))), firstTotal: Math.round(clamp(raw.firstTotal, 0, 500, DEFAULT.firstTotal)),
    };
  } catch { return null; }
}

// ── what moved it: each change switched off on its own
export type Part = { key: string; label: string; without: (l: Levers) => Levers };
export function partsOf(l: Levers, pack: Pack): Part[] {
  const name = (id: string) => pack.players[id]?.name ?? id;
  const teams = pack.teams.map((t) => t.name);
  const parts: Part[] = [];
  const simple: [keyof Levers, string][] = [["boundary", "Pitch: runs"], ["wickets", "Pitch: wickets"], ["spin", "Help for spinners"], ["pace", "Help for seamers"], ["dew", "Dew in the 2nd innings"]];
  if (l.battingFirst !== "" && !l.useSituation) parts.push({ key: "bf", label: `${teams[Number(l.battingFirst)]} bat first`, without: (x) => ({ ...x, battingFirst: "" }) });
  for (const [k, label] of simple) if (l[k] !== DEFAULT[k]) parts.push({ key: k, label, without: (x) => ({ ...x, [k]: DEFAULT[k] }) });
  // form and rule-outs, grouped by team (presets change several players at once); one player alone is named
  const teamOf = (id: string) => pack.teams.findIndex((t) => t.players.includes(id));
  const groups = new Map<string, string[]>();
  for (const [id, f] of Object.entries(l.form)) { const g = `f:${teamOf(id)}:${f > 1 ? "up" : "down"}`; groups.set(g, [...(groups.get(g) ?? []), id]); }
  for (const id of l.exclude) { const g = `x:${teamOf(id)}`; groups.set(g, [...(groups.get(g) ?? []), id]); }
  for (const [g, ids] of groups) {
    const [kind, k, dir] = g.split(":"), team = teams[Number(k)] ?? "";
    const label = kind === "x" ? (ids.length === 1 ? `${name(ids[0])} can't bowl` : `${team}: ${ids.length} bowlers left out`)
      : ids.length === 1 ? `${name(ids[0])} ${dir === "up" ? "in form" : "out of form"}` : `${team}: ${ids.length} players ${dir === "up" ? "in form" : "out of form"}`;
    parts.push({ key: g, label, without: (x) => kind === "x" ? { ...x, exclude: x.exclude.filter((e) => !ids.includes(e)) }
      : { ...x, form: Object.fromEntries(Object.entries(x.form).filter(([id]) => !ids.includes(id))) } });
  }
  if (l.useSituation) parts.push({ key: "sit", label: "The match situation", without: (x) => ({ ...x, useSituation: false }) });
  return parts;
}
