"use client";
// Results: every projection the match centre showed before a match, checked against the scorecard.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { loadResult, loadResults } from "@/lib/data";
import type { FantasyResult, ResultDoc, ResultIndex, TabScore } from "@/lib/types";

const PER_PAGE = 3;
const TABS = ["Overview", "Scores", "Wickets", "Players", "Matchups"] as const;
const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(100 * x)}%`);
const share = (t?: TabScore) => (t && t.checks ? t.hits / t.checks : null);
const fmtDate = (d?: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

function Bar({ value }: { value: number | null }) {
  return <div className="meter res-meter"><i style={{ width: `${100 * (value ?? 0)}%` }} /></div>;
}

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

function Results() {
  const params = useSearchParams();
  const [index, setIndex] = useState<ResultIndex | null>(null);
  const [err, setErr] = useState(false);
  const [id, setId] = useState<string | null>(params.get("id"));
  const [doc, setDoc] = useState<ResultDoc | null>(null);
  const [tab, setTab] = useState<string>("All");
  const [page, setPage] = useState(0);

  useEffect(() => {
    loadResults().then(setIndex).catch(() => setErr(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDoc(null);
    const u = new URL(window.location.href);
    if (!id) {
      u.searchParams.delete("id");
      window.history.replaceState(null, "", u.toString());
      return;
    }
    loadResult(id).then((d) => {
      setDoc(d);
      requestAnimationFrame(() => document.getElementById("res-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }).catch(() => setDoc(null));
    u.searchParams.set("id", id);
    window.history.replaceState(null, "", u.toString());
  }, [id]);

  if (err || (index && !index.matches.length)) {
    return <p className="notice">No results yet. Each match appears here once it has finished and its scorecard is in.</p>;
  }
  if (!index) return <div className="skeleton card" style={{ minHeight: 280 }} aria-busy="true" />;
  const matches = [...index.matches].sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "") || x.id.localeCompare(y.id));
  const pages = Math.ceil(matches.length / PER_PAGE);
  const shown = matches.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const items = doc ? doc.items.filter((c) => tab === "All" || c.tab === tab) : [];

  const scored = index.matches.filter((m) => m.checks).length;      // rain-shortened matches are listed, not scored
  return (
    <div className="grid">
      <div className={`grid res-stats${index.fantasy ? " four" : ""}`}>
        <div className="card"><div className="cs-k">Projections that came true</div>
          <div className="stat dash-stat">{pct(index.accuracy)}</div>
          <p className="small muted">{index.hits} of {index.checks} checks across {scored} match{scored === 1 ? "" : "es"}.</p></div>
        <div className="card"><div className="cs-k">Favourite won</div>
          <div className="stat dash-stat">{index.favourite_won}<span className="dash-of"> / {scored}</span></div>
          <p className="small muted">The side we made more likely to win.</p></div>
        <div className="card"><div className="cs-k">By tab</div>
          <div className="res-tabs">
            {TABS.map((t) => (
              <div key={t}><span>{t}</span><Bar value={share(index.tabs[t])} /><b>{pct(share(index.tabs[t]))}</b></div>
            ))}
          </div></div>
        {index.fantasy && (
          <div className="card"><div className="cs-k">Fantasy picks</div>
            <div className="stat dash-stat">{pct(index.fantasy.single)}</div>
            <p className="small muted">Of the best possible XI, for our single team on average across {index.fantasy.matches} match
              {index.fantasy.matches === 1 ? "" : "es"}. Best of our five teams: {pct(index.fantasy.best_of_teams)}.</p></div>
        )}
      </div>

      <div className="res-head">
        <h2>Matches</h2>
      </div>
      <div className="grid res-cards">
        {shown.map((m) => (
          <button key={m.id} type="button" className={`card res-card${m.id === id ? " active" : ""}`} aria-pressed={m.id === id}
            onClick={() => { setId(m.id === id ? null : m.id); setTab("All"); }}>
            <span className="cs-k">{fmtDate(m.date)}</span>
            <b className="res-card-title">{m.title ?? m.teams.map((t) => t.name).join(" v ")}</b>
            <span className="small muted">{m.result}</span>
            {m.checks ? <span className="res-card-score"><span className="stat dash-stat">{pct(m.accuracy)}</span>
              <span className="small muted">{m.hits} of {m.checks} came true</span></span>
              : <span className="res-card-score"><span className="small muted">{m.note ?? "Not scored"}</span></span>}
          </button>
        ))}
      </div>
      {pages > 1 && (
        <nav className="res-pages" aria-label="Matches pages">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">‹</button>
          {Array.from({ length: pages }, (_, k) => (
            <button key={k} type="button" aria-current={k === page ? "page" : undefined} onClick={() => setPage(k)}>{k + 1}</button>
          ))}
          <button type="button" disabled={page === pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page">›</button>
        </nav>
      )}

      {id && !doc && <div className="skeleton card" style={{ minHeight: 320 }} aria-busy="true" />}
      {doc && (
        <div className="card" id="res-detail" style={{ scrollMarginTop: 80 }}>
          <div className="card-head">
            <div>
              <p className="cs-k">{doc.competition}{doc.date ? ` · ${fmtDate(doc.date)}` : ""}</p>
              <h3 style={{ margin: "4px 0" }}>{doc.title ?? doc.teams.map((t) => t.name).join(" v ")}</h3>
              <p className="small" style={{ margin: 0 }}><b>{doc.result}</b>{doc.scores.length ? ` · ${doc.scores.map((s) => `${s.team} ${s.runs}/${s.wickets}`).join(", ")}` : ""}</p>
            </div>
            {doc.checks ? <div className="res-big"><div className="stat dash-stat">{pct(doc.accuracy)}</div><span className="small muted">{doc.hits} of {doc.checks} came true</span></div>
              : <div className="res-big"><span className="small muted">Not scored</span></div>}
          </div>
          {doc.note && <p className="small"><b>{doc.note}</b></p>}
          <p className="small muted">Our forecast before the start: {doc.teams.map((t, k) => `${t.name} ${pct(doc.forecast.win[t.name])} to win, projected ${doc.forecast.projected[k] !== null ? Math.round(doc.forecast.projected[k]!) : "—"}`).join(" · ")}.{" "}
            <Link href={`/match/?id=${encodeURIComponent(doc.id)}`}>See the forecast</Link></p>
          <div className="seg res-seg" role="group" aria-label="Tab">
            {["All", ...TABS].map((t) => (
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
      )}

      <p className="small muted">A range counts when the result lands inside the 80% range we showed, so expect about 8 in 10. A pick counts
        when the outcome was among our top choices. Forecasts lock at the start of play.</p>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <div className="page-head" style={{ paddingBottom: 80 }}>
      <p className="cs-eyebrow">Results</p>
      <h1><span>What we said.</span><span>What happened.</span></h1>
      <p className="cs-lede">Every projection in the match centre, checked against the scorecard once the match is over.</p>
      <div style={{ marginTop: 32 }}>
        <Suspense fallback={<div className="skeleton card" style={{ minHeight: 280 }} />}><Results /></Suspense>
      </div>
    </div>
  );
}
