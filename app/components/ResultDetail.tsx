"use client";
// One match's result: every projection the match centre showed before the start, checked against the scorecard,
// and the fantasy picks against real points. Shown on /results/{id}/.
import Link from "next/link";
import { useState } from "react";
import { matchPath } from "@/lib/matchText";
import type { FantasyResult, ResultDoc } from "@/lib/types";

export const RESULT_TABS = ["Overview", "Scores", "Wickets", "Players", "Matchups"] as const;
export const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(100 * x)}%`);
export const fmtDate = (d?: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Fantasy picks against the scorecard: real points, the best XI in hindsight, and our teams as a share of it. */
function FantasyResultView({ f }: { f: FantasyResult }) {
  const name = (p: string) => f.names[p] ?? p;
  const team = (players: string[], c: string, vc: string, total: number, title: string) => (
    <div>
      <p className="cs-k" style={{ margin: "0 0 6px" }}>{title}</p>
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
    </div>
  );
  return (
    <div style={{ marginTop: 32 }}>
      <h3>Fantasy picks</h3>
      <p className="small" style={{ margin: "4px 0 10px" }}>Our single team scored <b>{Math.round(f.single.points ?? 0)}</b> points, <b>{pct(f.single.share)}</b> of
        the best XI anyone could have picked afterwards ({Math.round(f.best.points)}). Best of our five teams: <b>{pct(f.best_of_teams)}</b>.</p>
      {f.after && <p className="small muted">This match went up before the Fantasy tab existed. These picks were made afterwards by the same
        model trained only on matches played before it, so it never saw this result.</p>}
      <div className="grid g2">
        {team(f.single.players, f.single.captain, f.single.vice_captain, f.single.points ?? 0, "Our single team")}
        {team(f.best.players, f.best.captain, f.best.vice_captain, f.best.points, "Best possible XI (in hindsight)")}
      </div>
      <p className="cs-k" style={{ margin: "20px 0 6px" }}>Our five-team combo</p>
      <div className="table-wrap"><table className="res-table">
        <thead><tr><th>Team</th><th>Captain</th><th>Vice-captain</th><th className="num">Points</th><th className="num">Share of best</th></tr></thead>
        <tbody>{f.teams.map((t, i) => (
          <tr key={i}><td>{i + 1}</td><td>{name(t.captain)}</td><td>{name(t.vice_captain)}</td>
            <td className="num">{Math.round(t.points ?? 0)}</td><td className="num">{pct(t.share)}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

export default function ResultDetail({ doc, heading = "h3" }: { doc: ResultDoc; heading?: "h1" | "h3" }) {
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
            <Link href={matchPath(doc.id)}>See the forecast</Link></p>
          <div className="seg res-seg" role="group" aria-label="Tab">
            {["All", ...RESULT_TABS].map((t) => (
              <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t}{t !== "All" && doc.tabs[t] ? ` ${doc.tabs[t].hits}/${doc.tabs[t].checks}` : ""}
              </button>
            ))}
          </div>
          <div className="table-wrap" style={{ marginTop: 14 }}><table className="res-table">
            <thead><tr>{tab === "All" && <th>Tab</th>}<th>Projection</th><th>We said</th><th>What happened</th><th className="num">True?</th></tr></thead>
            <tbody>{items.map((c, i) => (
              <tr key={i}>{tab === "All" && <td className="small muted">{c.tab}</td>}<td>{c.check}</td><td>{c.projected}</td><td>{c.actual}</td>
                <td className="num"><span className={`res-mark ${c.hit ? "hit" : "miss"}`} aria-label={c.hit ? "came true" : "missed"}>{c.hit ? "✓" : "✕"}</span></td></tr>
            ))}</tbody>
          </table></div>
          {doc.fantasy && <FantasyResultView f={doc.fantasy} />}
        </div>
  );
}
