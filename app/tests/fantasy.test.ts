// node --test: the fantasy article's must-haves, in-form and suits-this-ground sections.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFantasy } from "../lib/preview.ts";
import type { MatchDoc, VenueIntel } from "../lib/types.ts";

function doc(): MatchDoc {
  const d = JSON.parse(readFileSync(new URL("../public/data/matches/m.json", import.meta.url), "utf8")) as MatchDoc;
  // the sample document predates some per-player fields: fill the ones the article reads
  d.summary.teams.forEach((t) => t.players.forEach((p) => {
    const r = p as unknown as { batting?: Record<string, unknown>; bowling?: Record<string, unknown> };
    if (r.batting) r.batting.p_at_least ??= { "30": 0.3, "50": 0.1 };
    if (r.bowling) r.bowling.p_wickets ??= { "2": 0.2, "3": 0.05 };
  }));
  const players: NonNullable<MatchDoc["fantasy"]>["players"] = {};
  d.summary.teams.forEach((t, k) => t.players.forEach((p, i) => {
    players[p.id] = { team: k, role: i === 0 ? "WK" : i < 5 ? "BAT" : i < 7 ? "AR" : "BOWL", expected: 60 - 2 * i - k, p_solid: 0.4 + 0.02 * i };
  }));
  const ids = Object.keys(players).slice(0, 11);
  const team = { players: ids, captain: ids[0], vice_captain: ids[1], expected: 500 };
  return { ...d, fantasy: { players, single: team, teams: [team], solid: 25, simulations: 2000 } };
}

function venue(d: MatchDoc): VenueIntel {
  const [a, b] = d.summary.teams;
  return {
    venue: { id: "g" }, format: "T20", gender: "male", since: "2020-01-01", model: null, history: null,
    phases: { here: {}, all: {} }, bowling: { here: {}, all: {} }, players: { batting: [], bowling: [] },
    fantasy: {
      ground: { id: "g", name: "Big Ground", matches: 30, label: "High-scoring, helps pace", runs_per_over: 9, boundary_pct: 0.2,
                balls_per_wicket: 18, pace_wicket_share: 0.6,
                similar: [{ id: "x", name: "Lake Oval, Town", matches: 12 }, { id: "y", name: "Hill Park", matches: 9 }] },
      players: [
        { id: a.players[3].id, name: a.players[3].name, team: a.name, form: { last5: 50, usual: 30, n: 40, runs: [10, 20, 30, 40, 70], wickets: [0, 0] } },
        { id: b.players[2].id, name: b.players[2].name, team: b.name, form: { last5: 33, usual: 30, n: 40, runs: [1, 2, 3, 4, 5], wickets: [] } },
        { id: b.players[8].id, name: b.players[8].name, team: b.name, fit: { n: 12, mean: 44, usual: 30, n_all: 50, n_ground: 3, mean_ground: 50, score: 9.3 } },
      ],
    },
  } as unknown as VenueIntel;
}

test("must-haves rank the XI by how often they have a decent game", () => {
  const a = buildFantasy(doc(), null, null)!;
  const s = a.sections.find((x) => x.id === "safe")!;
  assert.equal(s.heading, "Must-haves");
  const items = (s.blocks[1] as { list: string[] }).list;
  assert.equal(items.length, 4);
  assert.match(items[0], /25\+ points in \d+% of simulations/);
});

test("in form lists only clear risers, latest innings first; suits ground names similar grounds and the fit", () => {
  const d = doc();
  const a = buildFantasy(d, venue(d), null)!;
  const form = a.sections.find((x) => x.id === "form")!;
  const items = (form.blocks[1] as { list: string[] }).list;
  assert.equal(items.length, 1);
  assert.match(items[0], /50 a match, up from 30 \(runs 70, 40, 30, 20, 10, latest first\)/);
  const g = a.sections.find((x) => x.id === "ground")!;
  assert.equal(g.heading, "Suits Big Ground");
  assert.match((g.blocks[0] as { p: string }).p, /High-scoring, helps pace\.\*\* Plays most like Lake Oval and Hill Park/);
  assert.match((g.blocks[2] as { list: string[] }).list[0], /44 points a match at these grounds v 30 overall \(12 matches, 3 here\)/);
  assert.ok(a.keypoints.some((k) => k.startsWith("In form:")));
});

test("no fantasy reads: the article keeps its old shape", () => {
  const a = buildFantasy(doc(), null, null)!;
  assert.ok(!a.sections.some((x) => x.id === "form" || x.id === "ground"));
});
