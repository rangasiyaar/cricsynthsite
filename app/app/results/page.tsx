"use client";
// Results: every projection the match centre showed before a match, checked against the scorecard.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { loadResult, loadResults } from "@/lib/data";
import type { ResultDoc, ResultIndex, TabScore } from "@/lib/types";

const PER_PAGE = 3;
const TABS = ["Overview", "Scores", "Wickets", "Players", "Matchups"] as const;
const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(100 * x)}%`);
const share = (t?: TabScore) => (t && t.checks ? t.hits / t.checks : null);
const fmtDate = (d?: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

function Bar({ value }: { value: number | null }) {
  return <div className="meter res-meter"><i style={{ width: `${100 * (value ?? 0)}%` }} /></div>;
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

  return (
    <div className="grid">
      <div className="grid res-stats">
        <div className="card"><div className="cs-k">Projections that came true</div>
          <div className="stat dash-stat">{pct(index.accuracy)}</div>
          <p className="small muted">{index.hits} of {index.checks} checks across {index.matches.length} match{index.matches.length === 1 ? "" : "es"}.</p></div>
        <div className="card"><div className="cs-k">Favourite won</div>
          <div className="stat dash-stat">{index.favourite_won}<span className="dash-of"> / {index.matches.length}</span></div>
          <p className="small muted">The side we made more likely to win.</p></div>
        <div className="card"><div className="cs-k">By tab</div>
          <div className="res-tabs">
            {TABS.map((t) => (
              <div key={t}><span>{t}</span><Bar value={share(index.tabs[t])} /><b>{pct(share(index.tabs[t]))}</b></div>
            ))}
          </div></div>
      </div>

      <div className="grid res-cards">
        {shown.map((m) => (
          <button key={m.id} type="button" className={`card res-card${m.id === id ? " active" : ""}`} aria-pressed={m.id === id}
            onClick={() => { setId(m.id === id ? null : m.id); setTab("All"); }}>
            <span className="cs-k">{fmtDate(m.date)}</span>
            <b className="res-card-title">{m.title ?? m.teams.map((t) => t.name).join(" v ")}</b>
            <span className="small muted">{m.result}</span>
            <span className="res-card-score"><span className="stat dash-stat">{pct(m.accuracy)}</span>
              <span className="small muted">{m.hits} of {m.checks} came true</span></span>
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
              <p className="small" style={{ margin: 0 }}><b>{doc.result}</b> · {doc.scores.map((s) => `${s.team} ${s.runs}/${s.wickets}`).join(", ")}</p>
            </div>
            <div className="res-big"><div className="stat dash-stat">{pct(doc.accuracy)}</div><span className="small muted">{doc.hits} of {doc.checks} came true</span></div>
          </div>
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
        </div>
      )}

      <p className="small muted">How we check: a range "comes true" when the actual number lands inside the 80% range we showed (10th–90th
        percentile), so a well-calibrated forecast lands about 8 in 10 of them; the misses are meant to happen too. Picks (the favourite, top
        scorer, best bowler, key duels) come true when what happened was the one, or among the few, we rated most likely. Forecasts are
        frozen at the start of play.</p>
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
