// Match preview articles (/previews/{id}/): a full written preview built from the published forecast, the ground's record
// (venue/<id>.json) and our results so far. Every number comes from that match's own simulation and ground history; the
// wording changes with the situation (close or one-sided, batting or bowling ground, toss matters or not), so no two
// previews read alike. Analytics language only: projections and chances, never betting terms.
import { SITE } from "./seo.ts";
import { matchPath } from "./matchText.ts";
import type { MatchDoc, PlayerRow, ResultIndex, VenueIntel } from "./types.ts";

export const PREVIEW_AUTHOR = { name: "CricSynthesis Staff", role: "Match analysis" };
/** Off while the design is reviewed: pages exist but stay out of search, the sitemap and every menu. */
export const PREVIEWS_LIVE = true;

export type Block =
  | { p: string }                                         // **bold** and [text](href) allowed
  | { list: string[]; ordered?: boolean }
  | { table: { head: string[]; rows: string[][] } }
  | { stats: { big: string; label: string }[] }
  | { links: { href: string; label: string }[] };
export type Section = { id: string; heading: string; blocks: Block[] };
export type Article = {
  id: string; path: string; title: string; h1: string; description: string; standfirst: string; keypoints: string[];
  sections: Section[]; faq: { q: string; a: string }[]; date: string; updated: string; minutes: number;
  teams: [string, string]; venue?: string; series: string; no: string; start?: string; xis: boolean;
  played?: boolean; result?: boolean;            // set by the page: the match is over (and whether its result is in)
};

export const previewPath = (id: string) => `/previews/${encodeURIComponent(id)}/`;
const pc = (p?: number | null) => (p == null ? "—" : `${Math.round(100 * p)}%`);
const r0 = (x?: number | null) => (x == null ? "—" : String(Math.round(x)));
const longDate = (d?: string) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";
const shortDate = (d?: string) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
const FORMAT: Record<string, string> = { T20: "T20", T10: "T10", HUNDRED: "Hundred", OD: "one-day (50 overs)" };
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const tab = (id: string, t: string) => `${matchPath(id)}?tab=${encodeURIComponent(t)}`;

/** How strong a favourite is, in words. */
function strength(p: number) {
  if (p < 0.53) return { adj: "the slightest of", tone: "close" as const };
  if (p < 0.58) return { adj: "narrow", tone: "close" as const };
  if (p < 0.66) return { adj: "clear", tone: "lean" as const };
  if (p < 0.76) return { adj: "strong", tone: "strong" as const };
  return { adj: "overwhelming", tone: "strong" as const };
}

function batters(t: { players: PlayerRow[] }, n = 3) {
  return t.players.filter((p) => p.batting).sort((a, b) => b.batting!.p_top_scorer - a.batting!.p_top_scorer).slice(0, n);
}
function bowlers(t: { players: PlayerRow[] }, n = 3) {
  return t.players.filter((p) => p.bowling && p.bowling.p_bowls > 0.5)
    .sort((a, b) => b.bowling!.p_best_bowler - a.bowling!.p_best_bowler).slice(0, n);
}

export function buildPreview(doc: MatchDoc, venue: VenueIntel | null, results: ResultIndex | null, now = new Date()): Article {
  const { match: m, summary: s } = doc;
  const id = m.id;
  const [ta, tb] = s.teams;
  const A = ta.name, B = tb.name;
  const short = [m.teams[0]?.short ?? A, m.teams[1]?.short ?? B];
  const pA = s.result.win[A] ?? 0, pB = s.result.win[B] ?? 0;
  const favK = pA >= pB ? 0 : 1, fav = favK ? B : A, dog = favK ? A : B, pFav = Math.max(pA, pB);
  const st = strength(pFav);
  const [series, no = ""] = (m.competition ?? "").split(" · ");
  const sims = s.meta.simulations.toLocaleString("en-IN");
  const ground = m.venue?.replace(/\s+/g, " ").trim();
  const groundShort = ground?.split(",")[0];
  const when = longDate(m.date);
  const fmt = FORMAT[s.meta.format] ?? s.meta.format;
  const first = s.teams.map((t) => t.batting.by_innings?.find((b) => b.innings === 1)?.score ?? t.batting.score);
  const med = s.teams.map((t) => t.batting.score.q["50"]);
  const xisWord = m.xis ? "confirmed" : "probable";

  // toss: A batting first wins pA1; A chasing wins about 1 − pB1
  const bt = Object.fromEntries((s.result.by_toss ?? []).map((b) => [b.batting_first, b.win]));
  const pA1 = bt[A]?.[A], pB1 = bt[B]?.[B];
  const edge = pA1 != null && pB1 != null ? pA1 - (1 - pB1) : null;
  const tossLine = edge == null ? "" : Math.abs(edge) < 0.02
    ? "The toss barely matters in our simulations: each side's chances are almost the same batting first or chasing."
    : `${edge > 0 ? "Batting first" : "Chasing"} is the better option here, worth about ${Math.round(100 * Math.abs(edge))} percentage points to either side. `
      + `${A} win ${pc(pA1)} of simulations when they bat first; ${B} win ${pc(pB1)} when they do.`;

  // ground
  const h = venue?.history ?? null;
  const ph = venue?.phases;
  const phaseDiffs = ph ? Object.entries(ph.here).map(([k, v]) => ({ k, d: ph.all[k] ? v.runs_per_over / ph.all[k].runs_per_over - 1 : 0, v }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d)) : [];
  const pace = venue?.bowling.here.pace, spin = venue?.bowling.here.spin;
  const paceAll = venue?.bowling.all.pace, spinAll = venue?.bowling.all.spin;
  const PH: Record<string, string> = { powerplay: "the powerplay", middle: "the middle overs", death: "the death overs" };

  const groundParas: Block[] = [];
  if (venue && h && h.matches > 0) {
    const since = venue.since.slice(0, 4);
    groundParas.push({ p: `${groundShort ?? "The ground"} has hosted **${h.matches}** ${venue.gender === "female" ? "women's" : "men's"} ${fmt} match${h.matches === 1 ? "" : "es"} since ${since}.`
      + (venue.model ? ` Our model reads it as **${venue.model.character}**: once the quality of the players who have played here is allowed for, scoring is ${signed(venue.model.scoring_index)} and wicket-taking ${signed(venue.model.wicket_index)} against a neutral ground.` : "") });
    if (h.first_innings.median != null)
      groundParas.push({ p: `The median first-innings score here is **${r0(h.first_innings.median)}**, with half of all first innings between ${r0(h.first_innings.q25)} and ${r0(h.first_innings.q75)}.`
        + (h.bat_first_won != null ? ` Teams batting first have won **${pc(h.bat_first_won)}** of ${h.decided} decided matches${h.bat_first_won > 0.56 ? ", so this has been a ground to set a total" : h.bat_first_won < 0.44 ? ", so chasing has been the way to win" : ", a fairly even split"}.` : "")
        + (h.toss.chose_bat != null ? ` Captains who won the toss chose to bat ${pc(h.toss.chose_bat)} of the time.` : "") });
    const big = phaseDiffs.find((x) => Math.abs(x.d) >= 0.04);
    if (big) groundParas.push({ p: `The clearest feature is ${PH[big.k] ?? big.k}: **${big.v.runs_per_over.toFixed(2)} runs an over** against ${ph!.all[big.k].runs_per_over.toFixed(2)} across all grounds, `
      + `${big.d > 0 ? "a fast-scoring phase that rewards set batters" : "a squeeze that rewards disciplined bowling"}.` });
    if (pace && spin && paceAll && spinAll && pace.economy && spin.economy && paceAll.economy && spinAll.economy) {
      const pe = pace.economy / paceAll.economy - 1, se = spin.economy / spinAll.economy - 1;
      const helps = se < pe - 0.03 ? "spin" : pe < se - 0.03 ? "pace" : null;
      groundParas.push({ p: `Pace has bowled ${pc(pace.share_of_balls)} of the overs here at ${pace.economy.toFixed(2)} an over and taken ${pc(pace.share_of_wickets)} of the wickets; spin has gone at ${spin.economy.toFixed(2)}.`
        + (helps ? ` Compared with other grounds, **${helps}** has done relatively better, which matters for how both captains use their attacks.` : " Neither type has a clear edge compared with other grounds.") });
    }
  } else {
    groundParas.push({ p: `${groundShort ?? "This ground"} has little recent history at this level, so our model leans on the players' records and grounds in the same city.` });
  }

  // players
  const keyBat = s.teams.map((t) => batters(t));
  const keyBowl = s.teams.map((t) => bowlers(t));
  const batLine = (p: PlayerRow) => `**${p.name}**: about ${r0(p.batting!.runs.mean)} runs on average, ${pc(p.batting!.p_at_least["30"])} chance of 30+, top scorer for their side in ${pc(p.batting!.p_top_scorer)} of simulations`;
  const bowlLine = (p: PlayerRow) => `**${p.name}**: ${p.bowling!.wickets.mean?.toFixed(1)} wickets on average, ${pc(p.bowling!.p_wickets["2"])} chance of 2+, leading wicket-taker in ${pc(p.bowling!.p_best_bowler)}`;
  const atGround = venue?.players.batting.filter((b) => b.innings >= 2).slice(0, 2) ?? [];
  const atGroundBowl = venue?.players.bowling.filter((b) => b.wickets >= 2).slice(0, 2) ?? [];

  const names = new Map<string, string>();
  s.teams.forEach((t) => t.players.forEach((p) => names.set(p.id, p.name)));
  const duels = s.matchups.slice(0, 3);

  const pp = s.teams.map((t) => t.batting.phases.find((x) => x.phase === "Powerplay"));
  const death = s.teams.map((t) => t.batting.phases.find((x) => x.phase === "Death"));

  // our record in this series / overall
  const inSeries = results?.matches.filter((r) => r.checks && (r.competition ?? "").split(" · ")[0] === series) ?? [];
  const recordLine = inSeries.length
    ? `So far in ${series}, the side we made favourite has won **${inSeries.filter((r) => r.favourite_won).length} of ${inSeries.length}** matches we have scored.`
    : results && results.matches.length
      ? `Across every match we have scored, the favourite has won **${results.favourite_won} of ${results.matches.filter((r) => r.checks).length}**, and ${pc(results.accuracy)} of our individual projections came true.`
      : "";

  const sections: Section[] = [
    { id: "details", heading: "Match details", blocks: [{ table: { head: ["", ""], rows: [
      ["Match", `${A} vs ${B}${no ? `, ${no}` : ""}`], ...(series ? [["Series", series]] : []),
      ["Date", when], ...(m.start_time ? [["Start", `${m.start_time} IST`]] : []), ...(ground ? [["Ground", ground]] : []), ["Format", fmt],
    ] } }] },
    { id: "prediction", heading: "Who will win", blocks: [
      { p: st.tone === "close"
        ? `This looks like a close contest. **${fav}** edge it, winning **${pc(pFav)}** of ${sims} simulations to ${dog}'s ${pc(1 - pFav - s.result.tie)}, a margin small enough that one good spell or one big innings could settle it.`
        : `**${fav}** go in as ${st.adj} favourites, winning **${pc(pFav)}** of ${sims} simulations of the match. ${dog} win ${pc(1 - pFav - s.result.tie)}${st.tone === "strong" ? ", so they need something special" : ", enough to keep this interesting"}.` },
      { p: `When the side batting first wins, the typical margin is about ${r0(s.result.margin_runs.q["50"])} runs; when the chasing side wins, it is usually with around ${r0(s.result.margin_wickets.q["50"])} wickets in hand.${s.result.tie > 0.005 ? ` A tie comes up in ${pc(s.result.tie)} of simulations.` : ""}` },
      ...(tossLine ? [{ p: tossLine }] : []),
      { links: [{ href: matchPath(id), label: "Open the match centre" }, { href: tab(id, "Overview"), label: "Win probability in detail" }] },
    ] },
    { id: "pitch", heading: `Pitch report: ${groundShort ?? "the ground"}`, blocks: [...groundParas,
      { links: [{ href: tab(id, "Venue intelligence"), label: "Full ground analysis" }] }] },
    { id: "xi", heading: `${m.xis ? "Playing XIs" : "Probable playing XIs"}`, blocks: [
      { p: m.xis ? "Both teams have named their XIs. Our forecast uses these exact line-ups." : "These are the XIs we expect from recent selections. The forecast reruns as soon as the teams are named at the toss." },
      { table: { head: [A, B], rows: Array.from({ length: Math.max(ta.players.length, tb.players.length) }, (_, i) => [ta.players[i]?.name ?? "", tb.players[i]?.name ?? ""]) } },
      { links: [{ href: tab(id, "Players"), label: "Every player's projection" }] },
    ] },
    { id: "players", heading: "Key players", blocks: [
      ...s.teams.flatMap((t, k) => [
        { p: `**${t.name}** with the bat:` } as Block,
        { list: keyBat[k].map(batLine) } as Block,
        ...(keyBowl[k].length ? [{ p: `And with the ball:` } as Block, { list: keyBowl[k].map(bowlLine) } as Block] : []),
      ]),
      ...(atGround.length || atGroundBowl.length ? [{ p: `At this ground, ${list([...atGround.map((b) => `${b.name} has ${b.runs} runs from ${b.innings} innings${b.strike_rate ? ` at a strike rate of ${b.strike_rate}` : ""}`), ...atGroundBowl.map((b) => `${b.name} has ${b.wickets} wickets at ${b.economy?.toFixed(2)} an over`)])}.` } as Block] : []),
      { links: [{ href: tab(id, "Top players"), label: "Top players" }, { href: tab(id, "MVP"), label: "Most valuable player" }] },
    ] },
    ...(duels.length ? [{ id: "duels", heading: "Key battles", blocks: [
      { p: "The bowler-against-batter match-ups most likely to decide the game, by how often the bowler dismisses the batter in our simulations:" },
      { list: duels.map((d) => `**${names.get(d.bowler) ?? d.bowler}** v **${names.get(d.batter) ?? d.batter}**: ${pc(d.p)}`), ordered: true },
      { links: [{ href: tab(id, "Matchups"), label: "All match-ups" }] },
    ] } as Section] : []),
    { id: "phases", heading: "Powerplay and death overs", blocks: [
      { table: { head: ["", short[0], short[1]], rows: [
        ...(pp[0] && pp[1] ? [[`Powerplay runs (overs ${pp[0].overs[0]}–${pp[0].overs[1]})`, r0(pp[0].runs.mean), r0(pp[1].runs.mean)],
          ["Powerplay wickets", pp[0].wickets.mean?.toFixed(1) ?? "—", pp[1].wickets.mean?.toFixed(1) ?? "—"],
          ["No wicket in the powerplay", pc(pp[0].p_no_wicket), pc(pp[1].p_no_wicket)]] : []),
        ...(death[0] && death[1] ? [[`Death-overs runs (overs ${death[0].overs[0]}–${death[0].overs[1]})`, r0(death[0].runs.mean), r0(death[1].runs.mean)]] : []),
      ] } },
      { links: [{ href: tab(id, "Scores"), label: "Over-by-over projections" }, { href: tab(id, "Wickets"), label: "Fall of wickets" }] },
    ] },
    { id: "score", heading: "Score prediction", blocks: [
      { p: `Batting first, ${A} project about **${r0(first[0].mean)}** and ${B} about **${r0(first[1].mean)}**. Across all simulations the likely ranges are:` },
      { table: { head: ["Team", "Median", "Likely (50%)", "Wide (80%)"], rows: s.teams.map((t, k) => [t.name, r0(med[k]),
        `${r0(t.batting.score.q["25"])}–${r0(t.batting.score.q["75"])}`, `${r0(t.batting.score.q["10"])}–${r0(t.batting.score.q["90"])}`]) } },
      ...(venue?.history?.first_innings.median != null ? [{ p: `For comparison, the median first innings at this ground is ${r0(venue.history.first_innings.median)}.` } as Block] : []),
    ] },
    ...(recordLine ? [{ id: "record", heading: "How our forecasts have done", blocks: [
      { p: recordLine + " Every forecast is frozen before the start and checked against the scorecard, misses included." },
      { links: [{ href: "/results/", label: "See every result" }] },
    ] } as Section] : []),
    { id: "explore", heading: "Explore this match", blocks: [
      { p: "Every number in this preview comes from the match centre, where you can dig into each one:" },
      { links: [{ href: matchPath(id), label: "Match centre" }, { href: tab(id, "Venue intelligence"), label: "Ground analysis" },
        { href: tab(id, "Players"), label: "Player projections" }, { href: tab(id, "Matchups"), label: "Match-ups" },
        ...(doc.fantasy ? [{ href: fantasyPath(id), label: "Fantasy prediction" }, { href: tab(id, "Fantasy"), label: "Fantasy tab" }] : []),
        { href: `/lab/?id=${encodeURIComponent(id)}`, label: "Try your own scenario in MatchSynth Lab" }] },
    ] },
  ];

  const topBat = [...keyBat[0], ...keyBat[1]].sort((a, b) => b.batting!.p_top_scorer - a.batting!.p_top_scorer)[0];
  const topBowl = [...keyBowl[0], ...keyBowl[1]].sort((a, b) => b.bowling!.p_best_bowler - a.bowling!.p_best_bowler)[0];
  const keypoints = [
    `${fav} win ${pc(pFav)} of ${sims} simulations${st.tone === "close" ? ": a close one" : ""}.`,
    `Projected scores: ${A} ${r0(med[0])}, ${B} ${r0(med[1])}.`,
    ...(venue?.model ? [`${groundShort} plays ${venue.model.character}${h?.first_innings.median != null ? `; median first innings ${r0(h.first_innings.median)}` : ""}.`] : []),
    ...(edge != null && Math.abs(edge) >= 0.02 ? [`${edge > 0 ? "Batting first" : "Chasing"} is worth about ${Math.round(100 * Math.abs(edge))} points of win probability.`] : []),
    ...(topBat ? [`Likeliest top scorer: ${topBat.name} (${pc(topBat.batting!.p_top_scorer)}).`] : []),
    ...(topBowl ? [`Likeliest leading wicket-taker: ${topBowl.name} (${pc(topBowl.bowling!.p_best_bowler)}).`] : []),
  ];

  const faq = [
    { q: `Who will win ${A} vs ${B}?`, a: `${fav} are favourites, winning ${pc(pFav)} of ${sims} simulations; ${dog} win ${pc(1 - pFav - s.result.tie)}.` },
    { q: `What is the score prediction for ${A} vs ${B}?`, a: `${A} around ${r0(med[0])} (likely ${r0(ta.batting.score.q["25"])}–${r0(ta.batting.score.q["75"])}), ${B} around ${r0(med[1])} (likely ${r0(tb.batting.score.q["25"])}–${r0(tb.batting.score.q["75"])}).` },
    ...(h?.first_innings.median != null ? [{ q: `What is the pitch report for ${groundShort}?`, a: `${venue?.model ? `It plays ${venue.model.character}. ` : ""}The median first-innings score is ${r0(h.first_innings.median)}${h.bat_first_won != null ? ` and teams batting first have won ${pc(h.bat_first_won)} of decided matches` : ""}.` }] : []),
    { q: `What are the ${xisWord} playing XIs?`, a: `${A}: ${ta.players.map((p) => p.name).join(", ")}. ${B}: ${tb.players.map((p) => p.name).join(", ")}.` },
    ...(tossLine ? [{ q: `Should the toss winner bat or bowl?`, a: tossLine }] : []),
    ...(topBat ? [{ q: `Who will be the top scorer?`, a: `${list([...keyBat[0].slice(0, 1), ...keyBat[1].slice(0, 1)].map((p) => `${p.name} (${pc(p.batting!.p_top_scorer)})`))} lead their sides.` }] : []),
    ...(m.start_time || ground ? [{ q: `When and where is ${A} vs ${B}?`, a: `${when}${m.start_time ? `, ${m.start_time} IST` : ""}${ground ? `, at ${ground}` : ""}.` }] : []),
  ];

  const words = JSON.stringify(sections).split(/\s+/).length + keypoints.join(" ").split(/\s+/).length;
  const label = [no, shortDate(m.date)].filter(Boolean).join(", ");
  const standfirst = `${st.tone === "close" ? `${A} and ${B} look evenly matched` : `${fav} start as ${st.adj} favourites against ${dog}`}${no ? ` in the ${no}` : ""}${series ? ` of ${series}` : ""}${groundShort ? ` at ${groundShort}` : ""}`
    + `${when ? ` on ${when}` : ""}. We played the match out ${sims} times with the ${xisWord} XIs: here is what decides it.`;
  return {
    id, path: previewPath(id), teams: [A, B], venue: ground, series, no, xis: !!m.xis,
    start: m.date ? (m.start_time ? `${m.date}T${m.start_time}:00+05:30` : m.date) : undefined,
    title: `${A} vs ${B} Preview & Prediction${label ? `, ${label}` : ""}: Pitch Report, Playing XI, Who Will Win`,
    h1: `${A} vs ${B}: preview and prediction`,
    description: `${A} vs ${B}${no ? ` ${no}` : ""} preview: ${fav} win ${pc(pFav)} of ${sims} simulations. Pitch report${groundShort ? ` for ${groundShort}` : ""}, ${xisWord} playing XIs, key players, score prediction and toss.`,
    standfirst, keypoints, sections, faq,
    date: (doc.generated_at ?? now.toISOString()).slice(0, 10), updated: doc.generated_at ?? now.toISOString(),
    minutes: Math.max(3, Math.round(words / 220)),
  };
}

function signed(x: number) {
  const d = Math.round(100 * (x - 1));
  return d === 0 ? "level" : `${d > 0 ? "+" : "−"}${Math.abs(d)}%`;
}

export function previewLd(a: Article, home: [string, string] = ["Match previews", "/previews/"]) {
  const url = `${SITE}${a.path}`;
  return [
    { "@context": "https://schema.org", "@type": "Article", headline: a.title.slice(0, 110), description: a.description,
      datePublished: a.date, dateModified: a.updated, mainEntityOfPage: url, image: `${SITE}/og-logo.png?v=1`,
      author: { "@type": "Organization", name: PREVIEW_AUTHOR.name, url: SITE },
      publisher: { "@type": "Organization", name: "CricSynthesis", url: SITE, logo: { "@type": "ImageObject", url: `${SITE}/email-logo.png` } } },
    { "@context": "https://schema.org", "@type": "SportsEvent", name: `${a.teams[0]} vs ${a.teams[1]}${a.no ? `, ${a.no}` : ""}`, sport: "Cricket",
      ...(a.start ? { startDate: a.start } : {}), eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      ...(a.venue ? { location: { "@type": "Place", name: a.venue } } : {}),
      competitor: a.teams.map((n) => ({ "@type": "SportsTeam", name: n })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: home[0], item: `${SITE}${home[1]}` },
      { "@type": "ListItem", position: 2, name: `${a.teams[0]} vs ${a.teams[1]}`, item: url }] },
    { "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: a.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
}

// ── Fantasy prediction articles (/fantasy/{id}/) ────────────────────────────────────────────────────────────────────
export const fantasyPath = (id: string) => `/fantasy/${encodeURIComponent(id)}/`;
const ROLE: Record<string, string> = { WK: "Wicketkeeper", BAT: "Batter", AR: "All-rounder", BOWL: "Bowler" };

export function buildFantasy(doc: MatchDoc, venue: VenueIntel | null, results: ResultIndex | null, now = new Date()): Article | null {
  const f = doc.fantasy;
  if (!f) return null;
  const { match: m, summary: s } = doc;
  const id = m.id;
  const [A, B] = s.teams.map((t) => t.name) as [string, string];
  const short = [m.teams[0]?.short ?? A, m.teams[1]?.short ?? B];
  const [series, no = ""] = (m.competition ?? "").split(" · ");
  const sims = (f.simulations ?? s.meta.simulations).toLocaleString("en-IN");
  const ground = m.venue?.replace(/\s+/g, " ").trim(), groundShort = ground?.split(",")[0];
  const when = longDate(m.date);
  const xisWord = m.xis ? "confirmed" : "probable";
  const rows = new Map<string, PlayerRow>();
  s.teams.forEach((t) => t.players.forEach((p) => rows.set(p.id, p)));
  const P = (pid: string) => ({ ...f.players[pid], id: pid, name: f.players[pid]?.name ?? rows.get(pid)?.name ?? pid, row: rows.get(pid) });
  const all = Object.keys(f.players).map(P).sort((a, b) => b.expected - a.expected);
  const xi = f.single.players.map(P).sort((a, b) => b.expected - a.expected);
  const inXi = new Set(f.single.players);
  const cap = P(f.single.captain), vc = P(f.single.vice_captain);
  const teamName = (k: number) => s.teams[k]?.name ?? "";
  const split = [0, 1].map((k) => xi.filter((p) => p.team === k).length);
  const roles = ["WK", "BAT", "AR", "BOWL"].map((r) => [r, xi.filter((p) => p.role === r).length] as const).filter(([, n]) => n);

  const why = (p: ReturnType<typeof P>) => {
    const b = p.row?.batting, w = p.row?.bowling, bits: string[] = [];
    if (b && b.p_bats > 0.6) bits.push(`about ${r0(b.runs.mean)} runs on average with a ${pc(b.p_at_least["30"])} chance of 30+`);
    if (w && w.p_bowls > 0.5) bits.push(`${w.wickets.mean?.toFixed(1)} wickets on average with a ${pc(w.p_wickets["2"])} chance of 2+`);
    return bits.length ? bits.join(", and ") : "a steady points source";
  };
  // upside: a big haul (50+ runs or 3+ wickets) relative to the field
  const upside = (p: ReturnType<typeof P>) => Math.max(p.row?.batting?.p_at_least["50"] ?? 0, p.row?.bowling?.p_wickets["3"] ?? 0);
  const safe = xi.filter((p) => (p.row?.batting?.p_bats ?? 0) > 0.9 || (p.row?.bowling?.p_bowls ?? 0) > 0.9).slice(0, 4);
  // always three differentials: the best players outside our XI on expected points
  const diffs = all.filter((p) => !inXi.has(p.id)).slice(0, 3);
  const punts = all.filter((p) => !inXi.has(p.id) && !diffs.includes(p)).sort((a, b) => upside(b) - upside(a)).filter((p) => upside(p) >= 0.08).slice(0, 3);
  const capOptions = all.slice(0, 3);

  // ground angle
  const h = venue?.history ?? null;
  const pace = venue?.bowling.here.pace, spin = venue?.bowling.here.spin, paceAll = venue?.bowling.all.pace, spinAll = venue?.bowling.all.spin;
  const angle: string[] = [];
  if (venue?.model) angle.push(`${groundShort ?? "The ground"} plays **${venue.model.character}**${venue.model.scoring_index > 1.03 ? ", so top-order batters and finishers carry extra value" : venue.model.scoring_index < 0.97 ? ", so wicket-taking bowlers carry extra value" : ""}.`);
  if (pace?.economy && spin?.economy && paceAll?.economy && spinAll?.economy) {
    const pe = pace.economy / paceAll.economy - 1, se = spin.economy / spinAll.economy - 1;
    if (se < pe - 0.03) angle.push("Spin has done relatively well here compared with other grounds: lean towards spinners who bowl their full quota.");
    else if (pe < se - 0.03) angle.push("Pace has done relatively well here compared with other grounds: seamers who bowl at the death are worth a look.");
  }
  if (h?.bat_first_won != null && Math.abs(h.bat_first_won - 0.5) > 0.06)
    angle.push(`Teams ${h.bat_first_won > 0.5 ? "batting first" : "chasing"} have won ${pc(h.bat_first_won > 0.5 ? h.bat_first_won : 1 - h.bat_first_won)} of decided matches here; once the toss is known, the side ${h.bat_first_won > 0.5 ? "setting the total" : "chasing"} is worth an extra player.`);

  const rec = results?.fantasy;
  const table = (players: ReturnType<typeof P>[]) => ({ table: { head: ["Player", "Team", "Role", "Expected points"], rows: [
    ...players.map((p) => [`${p.name}${p.id === f.single.captain ? " (C)" : p.id === f.single.vice_captain ? " (VC)" : ""}`, short[p.team] ?? "",
      ROLE[p.role ?? ""] ?? "—", (p.expected * (p.id === f.single.captain ? 2 : p.id === f.single.vice_captain ? 1.5 : 1)).toFixed(0)]),
    ["**Team total**", "", "", f.single.expected.toFixed(0)]] } }) as Block;

  const sections: Section[] = [
    { id: "details", heading: "Match details", blocks: [{ table: { head: ["", ""], rows: [
      ["Match", `${A} vs ${B}${no ? `, ${no}` : ""}`], ...(series ? [["Series", series]] : []), ["Date", when],
      ...(m.start_time ? [["Start", `${m.start_time} IST`]] : []), ...(ground ? [["Ground", ground]] : []),
      ["Line-ups", m.xis ? "Confirmed XIs" : "Probable XIs (updates at the toss)"]] } }] },
    { id: "team", heading: "Best fantasy XI", blocks: [
      { p: `Our team for ${A} vs ${B}, built from every player's points across ${sims} simulations of the match with the ${xisWord} XIs. It is the XI with the highest expected total that fits the usual team rules: **${split[0]} from ${short[0]}, ${split[1]} from ${short[1]}**, with ${list(roles.map(([r, n]) => `${n} ${(ROLE[r] ?? r).toLowerCase()}${n === 1 ? "" : "s"}`))}.` },
      table(xi),
      { links: [{ href: tab(id, "Fantasy"), label: "Open the Fantasy tab" }] },
    ] },
    { id: "captain", heading: "Captain and vice-captain", blocks: [
      { p: `**${cap.name}** (${teamName(cap.team)}) is our captain, with ${cap.expected.toFixed(0)} expected points: ${why(cap)}. **${vc.name}** (${teamName(vc.team)}) is vice-captain with ${vc.expected.toFixed(0)}: ${why(vc)}.` },
      { p: "The three strongest captaincy options:" },
      { list: capOptions.map((p) => `**${p.name}** (${short[p.team]}): ${p.expected.toFixed(0)} expected points, ${pc(upside(p))} chance of a big haul`), ordered: true },
    ] },
    { id: "safe", heading: "Safe picks", blocks: [
      { p: "Players almost certain to get a full go with bat or ball, so their points rarely collapse:" },
      { list: safe.map((p) => `**${p.name}** (${short[p.team]}, ${ROLE[p.role ?? ""] ?? "player"}): ${p.expected.toFixed(0)} expected, ${why(p)}`) },
    ] },
    ...(diffs.length ? [{ id: "differentials", heading: "Differentials", blocks: [
      { p: "Three players outside our XI who score well in the simulations: good swaps if you want a team that stands apart:" },
      { list: diffs.map((p) => `**${p.name}** (${short[p.team]}): ${p.expected.toFixed(0)} expected, ${why(p)}`) },
    ] } as Section] : []),
    ...(punts.length ? [{ id: "punts", heading: "High-ceiling punts", blocks: [
      { p: "Lower on average, but with a real chance of a match-winning haul (50+ runs or 3+ wickets):" },
      { list: punts.map((p) => `**${p.name}** (${short[p.team]}): ${pc(upside(p))} chance of a big haul, ${p.expected.toFixed(0)} expected`) },
    ] } as Section] : []),
    ...(angle.length ? [{ id: "pitch", heading: `Pitch angle: ${groundShort ?? "the ground"}`, blocks: [
      ...angle.map((t) => ({ p: t }) as Block),
      { links: [{ href: tab(id, "Venue intelligence"), label: "Full ground analysis" }] },
    ] } as Section] : []),
    ...(f.teams.length > 1 ? [{ id: "combos", heading: `${f.teams.length} teams for multiple entries`, blocks: [
      { p: "If you enter more than one team, these are built to cover different ways the match can go, rather than repeating the same XI:" },
      { table: { head: ["Team", "Captain", "Vice-captain", "Expected"], rows: f.teams.map((t, i) => [String(i + 1), P(t.captain).name, P(t.vice_captain).name, t.expected.toFixed(0)]) } },
      { links: [{ href: `/lab/?id=${encodeURIComponent(id)}`, label: "Rebuild the teams for your own scenario in MatchSynth Lab" }] },
    ] } as Section] : []),
    ...(rec && rec.matches ? [{ id: "record", heading: "How our fantasy picks have done", blocks: [
      { p: `Across ${rec.matches} matches we have scored, our single team averaged **${pc(rec.single)}** of the best possible XI picked after the match, and the best of our five teams **${pc(rec.best_of_teams)}**.` },
      { links: [{ href: "/results/", label: "Every result, pick by pick" }] },
    ] } as Section] : []),
    { id: "explore", heading: "Explore this match", blocks: [
      { links: [{ href: previewPath(id), label: "Match preview" }, { href: matchPath(id), label: "Match centre" },
        { href: tab(id, "Players"), label: "Player projections" }, { href: tab(id, "MVP"), label: "Most valuable player" },
        { href: `/lab/?id=${encodeURIComponent(id)}`, label: "MatchSynth Lab" }] },
    ] },
  ];

  const keypoints = [
    `Captain ${cap.name}, vice-captain ${vc.name}.`,
    `Team split ${short[0]} ${split[0]} – ${split[1]} ${short[1]}; ${f.single.expected.toFixed(0)} expected points.`,
    ...(safe[0] ? [`Safest pick: ${safe[0].name}.`] : []),
    ...(diffs[0] ? [`Differential: ${diffs[0].name}.`] : []),
    ...(punts[0] ? [`High-ceiling punt: ${punts[0].name} (${pc(upside(punts[0]))} chance of a big haul).`] : []),
    ...(venue?.model ? [`${groundShort} plays ${venue.model.character}.`] : []),
  ];
  const faq = [
    { q: `Who should be captain for ${A} vs ${B}?`, a: `${cap.name}, with ${cap.expected.toFixed(0)} expected points; ${vc.name} as vice-captain.` },
    { q: `What is the best fantasy team for ${A} vs ${B}?`, a: `${xi.map((p) => p.name).join(", ")}.` },
    { q: `Which players are good differentials?`, a: diffs.length ? `${list(diffs.map((p) => p.name))}: close to the best XI on expected points but less obvious picks.` : "Our XI already includes every player close to the top on expected points." },
    { q: `How are these fantasy picks made?`, a: `Every player's points are counted ball by ball across ${sims} simulations of the match; the team is the XI with the highest expected total that fits the team rules.` },
    { q: `Are these the confirmed playing XIs?`, a: m.xis ? "Yes, the picks use the XIs named at the toss." : "Not yet: the picks use probable XIs and update once the teams are named at the toss." },
  ];
  const words = JSON.stringify(sections).split(/\s+/).length;
  const label = [no, shortDate(m.date)].filter(Boolean).join(", ");
  return {
    id, path: fantasyPath(id), teams: [A, B], venue: ground, series, no, xis: !!m.xis,
    start: m.date ? (m.start_time ? `${m.date}T${m.start_time}:00+05:30` : m.date) : undefined,
    title: `${short[0]} vs ${short[1]} Fantasy Prediction${label ? `, ${label}` : ""}: Captain, Vice-Captain & Best XI`,
    h1: `${A} vs ${B}: fantasy prediction`,
    description: `${A} vs ${B} fantasy team from ${sims} simulations: ${cap.name} captain, ${vc.name} vice-captain, safe picks, differentials and ${f.teams.length} teams for multiple entries.`,
    standfirst: `Our fantasy team for ${A} vs ${B}${no ? `, ${no}` : ""}${groundShort ? ` at ${groundShort}` : ""}${when ? ` on ${when}` : ""}: captain, vice-captain, safe picks, differentials and punts, from ${sims} simulations with the ${xisWord} XIs.`,
    keypoints, sections, faq,
    date: (doc.generated_at ?? now.toISOString()).slice(0, 10), updated: doc.generated_at ?? now.toISOString(),
    minutes: Math.max(3, Math.round(words / 220)),
  };
}
