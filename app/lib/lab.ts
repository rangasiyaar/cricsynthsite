// MatchSynth Lab: the levers, ready-made scenarios (presets), share links and the "what moved it" breakdown.
// Presets are built for each match from its own data (teams, batting orders, bowlers, the published forecast), so a
// preset like "Openers fire" names the real players. A preset only sets its own levers, on top of whatever is set
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
  const name = (id: string) => pack.players[id]?.name ?? id;
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
    const bat = [...rows].sort((a, b) => (b.batting?.runs.mean ?? 0) - (a.batting?.runs.mean ?? 0))[0];
    const bowl = [...rows].filter((p) => (p.bowling?.p_bowls ?? 0) > 0.25).sort((a, b) => (b.bowling?.wickets.mean ?? 0) - (a.bowling?.wickets.mean ?? 0))[0];
    return { bat: bat?.id, bowl: bowl?.id };
  };

  const out: Preset[] = [
    // ── the pitch and the ground
    { id: "flat", group: "Pitch", title: "Flat road", blurb: "True bounce and a quick outfield. Batters can hit through the line, and bowlers have nowhere to hide.", set: { boundary: 1.25, wickets: 0.85 } },
    { id: "small", group: "Pitch", title: "Small ground", blurb: "Short boundaries. Mis-hits clear the rope and the spinners get taken down.", set: { boundary: 1.3 } },
    { id: "big", group: "Pitch", title: "Big ground", blurb: "Long boundaries. More twos and threes, fewer sixes, and catches in the deep.", set: { boundary: 0.85 } },
    { id: "slow", group: "Pitch", title: "Slow, low pitch", blurb: "The ball stops on the batter. Hard to time, so totals stay low and dot balls pile up.", set: { boundary: 0.82, wickets: 1.05 } },
    { id: "twopaced", group: "Pitch", title: "Two-paced pitch", blurb: "Some balls grip, some skid on. Good balls take wickets and new batters struggle.", set: { boundary: 0.9, wickets: 1.15 } },
    { id: "green", group: "Pitch", title: "Green top", blurb: "Grass left on the pitch. Seamers get movement off the surface all day.", set: { pace: 1.45, wickets: 1.15, boundary: 0.92 } },
    { id: "turner", group: "Pitch", title: "Raging turner", blurb: "Dry and cracked. Spinners turn it square and run through the middle order.", set: { spin: 1.55, wickets: 1.1, boundary: 0.88 } },
    { id: "grip", group: "Pitch", title: "Slow turner", blurb: "The ball grips and turns slowly. Spinners are hard to hit rather than hard to play.", set: { spin: 1.25, boundary: 0.9 } },
    { id: "sporting", group: "Pitch", title: "Sporting pitch", blurb: "Something for everyone: bounce for the seamers early, a bit of turn later.", set: { pace: 1.15, spin: 1.15 } },
    { id: "highveld", group: "Pitch", title: "Bouncy and quick", blurb: "Pace and carry. Shots in front of square pay off, and fast bowlers find the edge.", set: { pace: 1.25, boundary: 1.1 } },
    // ── weather and the time of day
    { id: "overcast", group: "Weather", title: "Overcast, ball swinging", blurb: "Cloud cover keeps the new ball moving. Top orders are under pressure early.", set: { pace: 1.35, wickets: 1.1 } },
    { id: "hot", group: "Weather", title: "Hot, dry day", blurb: "Flat to start, then the pitch wears and the spinners come into it.", set: { boundary: 1.1, spin: 1.15 } },
    { id: "humid", group: "Weather", title: "Humid evening", blurb: "Heavy air helps swing under lights, then dew settles later on.", set: { pace: 1.2, dew: 0.5 } },
    { id: "dew", group: "Weather", title: "Heavy dew", blurb: "A wet ball in the second innings. Spinners can't grip it and the side batting second has it easier.", set: { dew: 1 } },
    { id: "dewlight", group: "Weather", title: "Some dew", blurb: "A bit of moisture late on. Helps the chasing side without taking the game away.", set: { dew: 0.5 } },
    { id: "nodew", group: "Weather", title: "Day game, no dew", blurb: "No dew at all, so the side batting first loses nothing by the toss.", set: { dew: 0 } },
    { id: "runfest", group: "Weather", title: "Night run-fest", blurb: "A flat pitch, a fast outfield and dew under lights. Big totals both ways.", set: { boundary: 1.2, wickets: 0.9, dew: 0.8 } },
  ];

  // ── the toss
  teams.forEach((t, k) => {
    out.push({ id: `bat${k}`, group: "Toss", title: `${t} bat first`, blurb: `${t} win the toss and set a target, or are put in.`, set: { battingFirst: String(k) as "0" | "1" } });
  });
  teams.forEach((t, k) => {
    out.push({ id: `chasedew${k}`, group: "Toss", title: `${t} chase under lights`, blurb: `${teams[1 - k]} bat first, then dew helps ${t} with the bat.`, set: { battingFirst: String(1 - k) as "0" | "1", dew: 0.8 } });
  });
  teams.forEach((t, k) => {
    out.push({ id: `defturn${k}`, group: "Toss", title: `${t} bat first on a wearing pitch`, blurb: `${t} get first use before the pitch breaks up for their spinners.`, set: { battingFirst: String(k) as "0" | "1", spin: 1.3 } });
  });

  // ── batting, for each side
  teams.forEach((t, k) => {
    const o = orderOf(k), s = star(k);
    if (o.length >= 2) out.push({ id: `open${k}`, group: "Batting", title: `${t}: openers fire`, blurb: `${name(o[0])} and ${name(o[1])} both in form. A fast start, and the powerplay belongs to ${t}.`, set: { form: pick(o.slice(0, 2), 1.35) } });
    if (o.length >= 3) out.push({ id: `collapse${k}`, group: "Batting", title: `${t}: top order fails`, blurb: `${o.slice(0, 3).map(name).join(", ")} all out of touch. ${t} lose early wickets and have to rebuild.`, set: { form: pick(o.slice(0, 3), 0.65) } });
    if (s.bat) out.push({ id: `star${k}`, group: "Batting", title: `${name(s.bat)} in red-hot form`, blurb: `${t}'s main batter at their best: harder to get out, and finds the rope more often.`, set: { form: pick([s.bat], 1.45) } });
    if (s.bat) out.push({ id: `staroff${k}`, group: "Batting", title: `${name(s.bat)} has an off day`, blurb: `${t}'s main batter scratches around and goes early. Someone else has to step up.`, set: { form: pick([s.bat], 0.6) } });
    if (o.length >= 7) out.push({ id: `finish${k}`, group: "Batting", title: `${t}: finishers fire`, blurb: `${o.slice(4, 7).map(name).join(", ")} in form. The last overs go big.`, set: { form: pick(o.slice(4, 7), 1.35) } });
    if (o.length >= 11) out.push({ id: `tail${k}`, group: "Batting", title: `${t}: the tail wags`, blurb: `The lower order hangs around and adds runs nobody expected.`, set: { form: pick(o.slice(7, 11), 1.45) } });
    if (o.length >= 6) out.push({ id: `middle${k}`, group: "Batting", title: `${t}: middle order wobbles`, blurb: `${o.slice(3, 6).map(name).join(", ")} struggle against the change bowlers.`, set: { form: pick(o.slice(3, 6), 0.7) } });
  });

  // ── bowling, for each side
  teams.forEach((t, k) => {
    const a = attack(k), s = star(k);
    const spinners = a.filter((x) => SPIN.has(x.kind)).map((x) => x.id), seamers = a.filter((x) => PACE.has(x.kind)).map((x) => x.id);
    if (seamers.length) out.push({ id: `pacefire${k}`, group: "Bowling", title: `${t}: seamers on fire`, blurb: `${seamers.map(name).join(", ")} hit their lengths and take early wickets.`, set: { form: pick(seamers, 1.3) } });
    if (spinners.length) out.push({ id: `spinfire${k}`, group: "Bowling", title: `${t}: spinners on top`, blurb: `${spinners.map(name).join(", ")} control the middle overs and squeeze the runs.`, set: { form: pick(spinners, 1.3) } });
    if (a.length) out.push({ id: `hit${k}`, group: "Bowling", title: `${t}: bowlers get hit`, blurb: `An off day for the whole attack. Lengths go missing and the runs flow.`, set: { form: pick(a.map((x) => x.id), 0.75) } });
    if (s.bowl) out.push({ id: `injured${k}`, group: "Bowling", title: `${name(s.bowl)} can't bowl`, blurb: `${t}'s main wicket-taker is out of the attack. The others share the overs.`, set: { exclude: [s.bowl] } });
    if (spinners.length && spinners.length < a.length) out.push({ id: `nospin${k}`, group: "Bowling", title: `${t} go in without spin`, blurb: `${spinners.map(name).join(", ")} don't bowl. ${t} rely on pace.`, set: { exclude: spinners } });
    if (s.bowl) out.push({ id: `starbowl${k}`, group: "Bowling", title: `${name(s.bowl)} at their best`, blurb: `${t}'s main bowler in rhythm: wickets with the new ball and at the death.`, set: { form: pick([s.bowl], 1.4) } });
  });

  // ── match situations (the first-innings side is the one already chosen, else the first team)
  const sit = (s: Partial<Levers>): Partial<Levers> => ({ useSituation: true, ...s });
  const need = (rate: number, overs: number) => par + 1 - Math.round(rate * (O - overs));
  out.push(
    { id: "flyer", group: "Situations", title: "Flying start", blurb: `${Math.round(par * 0.42)} without loss after the powerplay (${PP} overs).`, set: sit({ innings: 1, runs: Math.round(par * 0.42), wkts: 0, overs: PP }) },
    { id: "ppcollapse", group: "Situations", title: "Powerplay collapse", blurb: `${Math.round(par * 0.18)} for 3 after ${PP} overs. Can the middle order rebuild?`, set: sit({ innings: 1, runs: Math.round(par * 0.18), wkts: 3, overs: PP }) },
    { id: "fivedown", group: "Situations", title: "Five down early", blurb: `${Math.round(par * 0.26)} for 5 after ${at(0.35)} overs. A rescue job for the lower order.`, set: sit({ innings: 1, runs: Math.round(par * 0.26), wkts: 5, overs: at(0.35) }) },
    { id: "squeeze", group: "Situations", title: "Middle-overs squeeze", blurb: `${Math.round(par * 0.45)} for 3 after ${at(0.6)} overs. Wickets in hand but the rate has dropped.`, set: sit({ innings: 1, runs: Math.round(par * 0.45), wkts: 3, overs: at(0.6) }) },
    { id: "launch", group: "Situations", title: "Set for a big finish", blurb: `${Math.round(par * 0.64)} for 2 after ${at(0.75)} overs. Plenty of wickets for the last push.`, set: sit({ innings: 1, runs: Math.round(par * 0.64), wkts: 2, overs: at(0.75) }) },
    { id: "rescue", group: "Situations", title: "Tail-end rescue", blurb: `${Math.round(par * 0.5)} for 7 after ${at(0.65)} overs. How many can the last three add?`, set: sit({ innings: 1, runs: Math.round(par * 0.5), wkts: 7, overs: at(0.65) }) },
    { id: "bigtarget", group: "Situations", title: "Chasing a big total", blurb: `The side batting first made ${Math.round(par * 1.2)}. The chase starts now.`, set: sit({ innings: 2, firstTotal: Math.round(par * 1.2), runs: 0, wkts: 0, overs: 0 }) },
    { id: "lowtotal", group: "Situations", title: "Defending a low total", blurb: `Only ${Math.round(par * 0.78)} on the board. Can the bowlers defend it?`, set: sit({ innings: 2, firstTotal: Math.round(par * 0.78), runs: 0, wkts: 0, overs: 0 }) },
    { id: "ontrack", group: "Situations", title: "Chase on track", blurb: `Chasing ${par + 1}: ${Math.round(par * 0.6)} for 2 after ${at(0.6)} overs.`, set: sit({ innings: 2, firstTotal: par, runs: Math.round(par * 0.6), wkts: 2, overs: at(0.6) }) },
    { id: "trouble", group: "Situations", title: "Chase in trouble", blurb: `Chasing ${par + 1}: ${Math.round(par * 0.38)} for 5 at halfway.`, set: sit({ innings: 2, firstTotal: par, runs: Math.round(par * 0.38), wkts: 5, overs: at(0.5) }) },
    { id: "rate12", group: "Situations", title: O >= 50 ? "Need 9 an over" : "Need 12 an over", blurb: `Chasing ${par + 1} with ${O - at(0.7)} overs left and the rate climbing. Wickets in hand: 6.`, set: sit({ innings: 2, firstTotal: par, runs: Math.max(0, need(O >= 50 ? 9 : 12, at(0.7))), wkts: 4, overs: at(0.7) }) },
    { id: "wobble", group: "Situations", title: "Cruising, then a wobble", blurb: `Chasing ${par + 1}: ${Math.round(par * 0.78)} for 6 after ${at(0.75)} overs. Three quick wickets have changed it.`, set: sit({ innings: 2, firstTotal: par, runs: Math.round(par * 0.78), wkts: 6, overs: at(0.75) }) },
    { id: "lastover", group: "Situations", title: "Last-over finish", blurb: `${O >= 50 ? 10 : 12} needed off the final over, 7 wickets down.`, set: sit({ innings: 2, firstTotal: par, runs: par + 1 - (O >= 50 ? 10 : 12), wkts: 7, overs: O - 1 }) },
    { id: "lastpair", group: "Situations", title: "Last pair at the crease", blurb: `Chasing ${par + 1}: ${par - 15} for 9 with ${Math.max(1, O - at(0.85))} overs left. One wicket to win it.`, set: sit({ innings: 2, firstTotal: par, runs: par - 15, wkts: 9, overs: at(0.85) }) },
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

/** Whether the current levers already include everything a preset sets. */
export function presetOn(l: Levers, p: Preset): boolean {
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
  for (const [id, f] of Object.entries(l.form)) parts.push({ key: `f:${id}`, label: `${name(id)} ${f > 1 ? "in form" : "out of form"}`,
    without: (x) => { const { [id]: _, ...rest } = x.form; return { ...x, form: rest }; } });
  for (const id of l.exclude) parts.push({ key: `x:${id}`, label: `${name(id)} can't bowl`, without: (x) => ({ ...x, exclude: x.exclude.filter((e) => e !== id) }) });
  if (l.useSituation) parts.push({ key: "sit", label: "The match situation", without: (x) => ({ ...x, useSituation: false }) });
  return parts;
}
