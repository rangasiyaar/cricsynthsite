// Search text for the per-match pages (/match/{id}/, /fantasy/, /playing-xi/, /results/{id}/): titles, descriptions,
// FAQ answers and structured data, all written from the published forecast so every page says something of its own.
// Analytics wording only: win probability and projections, never betting language.
import { SITE } from "./seo.ts";
import type { MatchDoc, PlayerRow, ResultDoc } from "./types.ts";

export type Kind = "prediction" | "fantasy" | "xi";
export type QA = { q: string; a: string };

const pc = (p: number | undefined) => `${Math.round(100 * (p ?? 0))}%`;
const r0 = (x: number | null | undefined) => (x === null || x === undefined ? "—" : String(Math.round(x)));

export const longDate = (d?: string) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";
const shortDate = (d?: string) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

export const matchPath = (id: string, kind: Kind = "prediction") =>
  `/match/${encodeURIComponent(id)}/${kind === "fantasy" ? "fantasy/" : kind === "xi" ? "playing-xi/" : ""}`;
export const resultPath = (id: string) => `/results/${encodeURIComponent(id)}/`;

/** "Sri Lanka tour of Pakistan 2026 · 2nd T20I" → series and match number. */
function split(comp?: string) {
  const [series, no] = (comp ?? "").split(" · ");
  return { series: series || "", no: no || "" };
}

/** Everything the pages say, from one match document. */
export function facts(doc: MatchDoc) {
  const { match: m, summary: s } = doc;
  const [ta, tb] = s.teams;
  const A = ta.name, B = tb.name;
  const fav = (s.result.win[A] ?? 0) >= (s.result.win[B] ?? 0) ? A : B;
  const { series, no } = split(m.competition);
  const players = s.teams.flatMap((t, k) => t.players.map((p) => ({ ...p, team: t.name, k })));
  const top = (key: (p: PlayerRow) => number | undefined, n = 3) =>
    players.filter((p) => (key(p) ?? 0) > 0).sort((x, y) => (key(y) ?? 0) - (key(x) ?? 0)).slice(0, n);
  const batters = top((p) => p.batting?.p_top_scorer);
  const bowlers = top((p) => p.bowling?.p_best_bowler);
  const pp = s.teams.map((t) => t.batting.phases?.[0]);
  const toss = (s.result.by_toss ?? []).map((b) => ({ first: b.batting_first, p: b.win[b.batting_first] ?? 0 }));
  const f = doc.fantasy;
  const name = (id: string) => f?.players[id]?.name ?? players.find((p) => p.id === id)?.name ?? id;
  const picks = f ? Object.entries(f.players).sort((x, y) => y[1].expected - x[1].expected).slice(0, 5)
    .map(([id, p]) => ({ id, name: name(id), team: s.teams[p.team]?.name ?? "", expected: p.expected })) : [];
  return {
    A, B, short: [m.teams[0]?.short ?? A, m.teams[1]?.short ?? B], fav, pFav: s.result.win[fav] ?? 0.5, tie: s.result.tie,
    series, no, date: m.date, when: longDate(m.date), shortWhen: shortDate(m.date), time: m.start_time, venue: m.venue,
    format: s.meta.format, overs: s.meta.rules.overs, xis: !!m.xis,
    score: s.teams.map((t) => ({ team: t.name, mean: t.batting.score.mean, lo: t.batting.score.q["10"], hi: t.batting.score.q["90"],
                                 wk: t.batting.wickets.mean })),
    pp: pp.map((ph, k) => ph && { team: s.teams[k].name, overs: ph.overs, runs: ph.runs.mean, wk: ph.wickets.mean }),
    toss, batters, bowlers, picks, fantasy: f, name,
    xi: m.teams.map((t, k) => ({ team: t.name, players: (s.teams[k]?.players ?? []).map((p) => p.name),
                                       ids: (s.teams[k]?.players ?? []).map((p) => p.id) })),
    insights: doc.insights ?? [],
  };
}
export type Facts = ReturnType<typeof facts>;

const vs = (x: Facts) => `${x.A} vs ${x.B}`;
const label = (x: Facts) => [x.no, x.shortWhen].filter(Boolean).join(", ");

export function title(x: Facts, kind: Kind) {
  const l = label(x) ? ` ${label(x)}` : "";
  if (kind === "fantasy") return `${x.short[0]} vs ${x.short[1]} Fantasy Prediction${l}: Captain, Vice-Captain & Best XI`;
  if (kind === "xi") return `${vs(x)}${l} ${x.xis ? "Playing XI" : "Probable Playing XI"} & Player Projections`;
  return `${vs(x)} Prediction${l}: Who Will Win & Score Prediction`;
}

export function description(x: Facts, kind: Kind) {
  const [a, b] = x.score;
  if (kind === "fantasy") {
    const f = x.fantasy;
    return f ? `${vs(x)} fantasy team: ${x.name(f.single.captain)} captain, `
      + `${x.name(f.single.vice_captain)} vice-captain, plus the top picks and five-team combinations.`
      : `${vs(x)} fantasy picks: expected points for every player, captain and vice-captain, published once the squads are in.`;
  }
  if (kind === "xi") {
    return `${vs(x)} ${x.xis ? "confirmed playing XIs" : "probable playing XIs"}${x.when ? ` for ${x.when}` : ""}`
      + `${x.venue ? ` at ${x.venue}` : ""}, with each player's projected runs, wickets and batting position.`;
  }
  return `${vs(x)}${x.no ? ` ${x.no}` : ""} prediction: ${x.fav} are favourites at ${pc(x.pFav)}. `
    + `Projected scores ${a.team} ${r0(a.mean)}, ${b.team} ${r0(b.mean)}${x.venue ? ` at ${x.venue}` : ""}. Top scorer, best bowler and toss.`;
}

export function faq(x: Facts, kind: Kind): QA[] {
  const [a, b] = x.score;
  const out: QA[] = [];
  const where = [x.when, x.time ? `${x.time} IST` : "", x.venue].filter(Boolean).join(", ");
  if (kind === "prediction") {
    out.push({ q: `Who will win ${vs(x)}?`, a: `${x.fav} are favourites at ${pc(x.pFav)}, `
      + `${x.fav === x.A ? x.B : x.A} ${pc(1 - x.pFav - x.tie)}.` });
    out.push({ q: `What is the score prediction for ${vs(x)}?`, a: `${a.team} project ${r0(a.mean)} (80% range ${r0(a.lo)}–${r0(a.hi)}) `
      + `and ${b.team} ${r0(b.mean)} (${r0(b.lo)}–${r0(b.hi)}).` });
    const [p0, p1] = x.pp;
    if (p0 && p1 && x.overs <= 20) out.push({ q: `What is the powerplay score prediction?`,
      a: [p0, p1].map((p) => `${p.team} ~${r0(p.runs)} for ${(p.wk ?? 0).toFixed(1)} wickets`).join("; ") + ` in overs ${p0.overs[0]}–${p0.overs[1]}.` });
    if (x.toss.length === 2) {
      // Batting first lifts both sides or neither: A first wins pA, A chasing wins about 1 − pB.
      const edge = x.toss[0].p - (1 - x.toss[1].p);
      out.push({ q: `Does the toss matter in ${vs(x)}?`, a: x.toss.map((t) => `${t.first} win ${pc(t.p)} when batting first`).join("; ")
        + `. ${Math.abs(edge) < 0.02 ? "Batting first or chasing makes little difference here." : `${edge > 0 ? "Batting first" : "Chasing"} adds about ${Math.round(100 * Math.abs(edge))} percentage points to either side's win chance.`}` });
    }
  }
  if (kind !== "fantasy" && x.batters.length) out.push({ q: `Who will be the top scorer in ${vs(x)}?`,
    a: x.batters.map((p) => `${p.name} (${p.team}) ${pc(p.batting?.p_top_scorer)}`).join(", ") + `.` });
  if (kind !== "fantasy" && x.bowlers.length) out.push({ q: `Who will take the most wickets?`,
    a: x.bowlers.map((p) => `${p.name} (${p.team}) ${pc(p.bowling?.p_best_bowler)}`).join(", ") + `.` });
  if (kind === "fantasy" && x.fantasy) {
    const f = x.fantasy;
    out.push({ q: `Who should be captain and vice-captain for ${vs(x)}?`, a: `${x.name(f.single.captain)} as captain and `
      + `${x.name(f.single.vice_captain)} as vice-captain.` });
    out.push({ q: `Which players score the most fantasy points?`, a: x.picks.map((p) => `${p.name} (${p.team}) ${p.expected.toFixed(0)}`).join(", ")
      + ` points.` });
  }
  if (kind === "xi") out.push({ q: `${x.xis ? "What are the playing XIs" : "What are the probable XIs"} for ${vs(x)}?`,
    a: x.xi.map((t) => `${t.team}: ${t.players.join(", ")}`).join(". ") + "." });
  if (where) out.push({ q: `When and where is ${vs(x)}?`, a: `${x.series ? `${x.series}${x.no ? `, ${x.no}` : ""}. ` : ""}${where}.` });
  return out;
}

/** SportsEvent + BreadcrumbList for one page (`qa` kept in the signature for callers). */
export function jsonLd(x: Facts, kind: Kind, id: string, qa: QA[]) {
  const url = `${SITE}${matchPath(id, kind)}`;
  const crumbs = [["Matches", `${SITE}/matches/`], [vs(x), `${SITE}${matchPath(id)}`]];
  if (kind !== "prediction") crumbs.push([kind === "fantasy" ? "Fantasy" : "Playing XI", url]);
  return [
    { "@context": "https://schema.org", "@type": "SportsEvent", name: `${vs(x)}${x.no ? `, ${x.no}` : ""}`, sport: "Cricket", url,
      ...(x.date ? { startDate: x.time ? `${x.date}T${x.time}:00+05:30` : x.date } : {}),
      eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      ...(x.venue ? { location: { "@type": "Place", name: x.venue } } : {}),
      ...(x.series ? { superEvent: { "@type": "SportsEvent", name: x.series } } : {}),
      competitor: [x.A, x.B].map((n) => ({ "@type": "SportsTeam", name: n })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: crumbs.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) },
    // No FAQPage: its answers are not shown on the page, and Google only accepts FAQ markup for visible answers.
  ];
}

// Results: what we said against what happened.
export function resultTitle(r: ResultDoc) {
  const [a, b] = r.teams.map((t) => t.name);
  const { no } = split(r.competition);
  return `${a} vs ${b}${no ? ` ${no}` : ""} Result${r.date ? ` ${shortDate(r.date)}` : ""}: Our Prediction v What Happened`;
}

export function resultDescription(r: ResultDoc) {
  const [a, b] = r.teams.map((t) => t.name);
  const fav = (r.forecast.win[a] ?? 0) >= (r.forecast.win[b] ?? 0) ? a : b;
  return `${a} vs ${b}: ${r.result ?? "result"}. Before the start we gave ${fav} ${pc(r.forecast.win[fav])}`
    + (r.checks ? `; ${r.hits} of ${r.checks} projections came true.` : ".");
}

export function resultLd(r: ResultDoc) {
  const [a, b] = r.teams.map((t) => t.name);
  const url = `${SITE}${resultPath(r.id)}`;
  return [
    { "@context": "https://schema.org", "@type": "SportsEvent", name: `${a} vs ${b}${split(r.competition).no ? `, ${split(r.competition).no}` : ""}`,
      sport: "Cricket", url, ...(r.date ? { startDate: r.date } : {}), eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      ...(r.venue ? { location: { "@type": "Place", name: r.venue } } : {}),
      competitor: [a, b].map((n) => ({ "@type": "SportsTeam", name: n })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Results", item: `${SITE}/results/` },
      { "@type": "ListItem", position: 2, name: `${a} vs ${b}`, item: url }] },
  ];
}
