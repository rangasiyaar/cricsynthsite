"use client";
// One match's result: every projection the match centre showed before the start, checked against the scorecard,
// and the fantasy picks against real points. Shown on /results/{id}/ and in the app at /m/result/?id={id}.
import Link from "next/link";
import { useState } from "react";
import FantasyPitch from "@/components/FantasyPitch";
import { matchPath } from "@/lib/matchText";
import type { FantasyResult, ResultDoc } from "@/lib/types";

export const RESULT_TABS = ["Overview", "Scores", "Wickets", "Players", "Matchups"] as const;
export const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(100 * x)}%`);
export const fmtDate = (d?: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Fantasy picks against the scorecard: real points, the ultimate team of the match (the best XI in hindsight), and our teams as a share of it. Each team
 * is a pitch card (FantasyPitch, as on the match centre's Fantasy tab) with the same team as a list underneath. Result
 * files made before the cards (no `team_of`) show the lists only. */
function FantasyResultView({ f, doc }: { f: FantasyResult; doc: ResultDoc }) {
  const [pick, setPick] = useState(0);
  const name = (p: string) => f.names[p] ?? p;
  const cards = !!f.team_of;
  const short = doc.teams.map((t) => t.short ?? t.name.slice(0, 3).toUpperCase());
  const match = { title: doc.title ?? doc.teams.map((t) => t.name).join(" v "), competition: doc.competition, date: doc.date };
  const list = (players: string[], c: string, vc: string, total: number) => (
    <div className="table-wrap"><table className="res-table">
      <thead><tr><th>Player</th><th className="num">Points</th></tr></thead>
      <tbody>{players.map((p) => {
        const mult = p === c ? 2 : p === vc ? 1.5 : 1;
        return <tr key={p}><td>{name(p)}{mult === 2 && <span className="tag pro" style={{ marginLeft: 6 }}>C</span>}
          {mult === 1.5 && <span className="tag" style={{ marginLeft: 6 }}>VC</span>}</td>
          <td className="num">{Math.round(f.real[p] * mult)}{mult > 1 && <span className="small muted"> ({Math.round(f.real[p])} × {mult})</span>}</td></tr>;
      })}</tbody>
      <tfoot><tr><td><b>Total</b></td><td className="num"><b>{Math.round(total)}</b></td></tr></tfoot>
    </table></div>
  );
  const team = (players: string[], c: string, vc: string, total: number, title: string, label: string) => (
    <div>
      <p className="cs-k" style={{ margin: "0 0 6px" }}>{title}</p>
      {cards ? <>
        <FantasyPitch players={players.map((id) => ({ id, name: name(id), team: f.team_of![id] ?? 0, role: f.roles?.[id], expected: f.real[id] ?? 0 }))}
                      captain={c} vice={vc} short={short} total={total} label={label} match={match}
                      note="Points from the scorecard (C 2×, VC 1.5×)." />
        <details className="fz-list" style={{ marginTop: 10 }}>
          <summary className="small">Show as a list</summary>
          {list(players, c, vc, total)}
        </details>
      </> : list(players, c, vc, total)}
    </div>
  );
  const t = f.teams[Math.min(pick, f.teams.length - 1)];
  return (
    <div style={{ marginTop: 32 }}>
      <h3>Fantasy picks</h3>
      <p className="small" style={{ margin: "4px 0 10px" }}>Our single team scored <b>{Math.round(f.single.points ?? 0)}</b> points, <b>{pct(f.single.share)}</b> of
        the ultimate team of the match ({Math.round(f.best.points)}), the best XI anyone could have picked afterwards. Best of our Mega League teams: <b>{pct(f.best_of_teams)}</b>.</p>
      {f.after && <p className="small muted">This match went up before the Fantasy tab existed. These picks were made afterwards by the same
        model trained only on matches played before it, so it never saw this result.</p>}
      <div className="grid g2">
        {team(f.single.players, f.single.captain, f.single.vice_captain, f.single.points ?? 0, "Our small league team", `Points · ${pct(f.single.share)} of ultimate`)}
        {team(f.best.players, f.best.captain, f.best.vice_captain, f.best.points, "Ultimate team of the match", "Points")}
      </div>
      <p className="cs-k" style={{ margin: "24px 0 6px" }}>Our {f.teams.length} Mega League teams</p>
      {cards && t ? <>
        <div className="seg res-seg" role="group" aria-label="Mega League team" style={{ marginBottom: 12 }}>
          {f.teams.map((x, i) => (
            <button key={i} type="button" aria-pressed={pick === i} onClick={() => setPick(i)} title={`${pct(x.share)} of the ultimate team`}>Team {i + 1}</button>
          ))}
        </div>
        <div className="res-fz-one">{team(t.players, t.captain, t.vice_captain, t.points ?? 0, `Team ${pick + 1}: ${name(t.captain)} (C), ${name(t.vice_captain)} (VC)`, `Points · ${pct(t.share)} of ultimate`)}</div>
      </> : (
        <div className="table-wrap"><table className="res-table">
          <thead><tr><th>Team</th><th>Captain</th><th>Vice-captain</th><th className="num">Points</th><th className="num">Share of ultimate</th></tr></thead>
          <tbody>{f.teams.map((x, i) => (
            <tr key={i}><td>{i + 1}</td><td>{name(x.captain)}</td><td>{name(x.vice_captain)}</td>
              <td className="num">{Math.round(x.points ?? 0)}</td><td className="num">{pct(x.share)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

export default function ResultDetail({ doc, heading = "h3", forecastHref }: { doc: ResultDoc; heading?: "h1" | "h3"; forecastHref?: string }) {
  const [tab, setTab] = useState<string>("All");
  const items = doc.items.filter((c) => tab === "All" || c.tab === tab);
  const H = heading;
  return (
        <div className="card" id="res-detail" style={{ scrollMarginTop: 80 }}>
          <div className="card-head">
            <div>
              <p className="cs-k">{doc.competition}{doc.date ? ` · ${fmtDate(doc.date)}` : ""}</p>
              <H style={{ margin: "4px 0" }}>{doc.title ?? doc.teams.map((t) => t.name).join(" v ")}</H>
              <p className="small" style={{ margin: 0 }}><b>{doc.result}</b>{doc.scores.length ? ` · ${doc.scores.map((s) => `${s.team} ${s.runs}/${s.wickets}`).join(", ")}` : ""}</p>
            </div>
            {doc.checks ? <div className="res-big"><div className="stat dash-stat">{pct(doc.accuracy)}</div><span className="small muted">{doc.hits} of {doc.checks} came true</span></div>
              : <div className="res-big"><span className="small muted">Not scored</span></div>}
          </div>
          {doc.note && <p className="small"><b>{doc.note}</b></p>}
          <p className="small muted">Our forecast before the start: {doc.teams.map((t, k) => `${t.name} ${pct(doc.forecast.win[t.name])} to win, projected ${doc.forecast.projected[k] !== null ? Math.round(doc.forecast.projected[k]!) : "—"}`).join(" · ")}.{" "}
            <Link href={forecastHref ?? matchPath(doc.id)}>See the forecast</Link></p>
          <div className="seg res-seg" role="group" aria-label="Tab">
            {["All", ...RESULT_TABS].map((t) => (
              <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t}{t !== "All" && doc.tabs[t] ? ` ${doc.tabs[t].hits}/${doc.tabs[t].checks}` : ""}
              </button>
            ))}
          </div>
          <div className="table-wrap" style={{ marginTop: 14 }}><table className={`res-table${tab === "All" ? " res-with-tab" : ""}`}>
            <thead><tr>{tab === "All" && <th>Tab</th>}<th>Projection</th><th>We said</th><th>What happened</th><th className="num">True?</th></tr></thead>
            <tbody>{items.map((c, i) => (
              <tr key={i}>{tab === "All" && <td className="small muted">{c.tab}</td>}<td>{c.check}</td><td>{c.projected}</td><td>{c.actual}</td>
                <td className="num"><span className={`res-mark ${c.hit ? "hit" : "miss"}`} aria-label={c.hit ? "came true" : "missed"}>{c.hit ? "✓" : "✕"}</span></td></tr>
            ))}</tbody>
          </table></div>
          {doc.fantasy && <FantasyResultView f={doc.fantasy} doc={doc} />}
        </div>
  );
}
