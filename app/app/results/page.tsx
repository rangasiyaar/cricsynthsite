"use client";
// Results: every projection the match centre showed before a match, checked against the scorecard.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { loadResults } from "@/lib/data";
import { resultPath } from "@/lib/matchText";
import type { ResultIndex, TabScore } from "@/lib/types";

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
  const router = useRouter();
  const old = params.get("id");                    // old links (/results/?id=…) go to the match's own page
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (old) { router.replace(resultPath(old)); return; }
    loadResults().then(setIndex).catch(() => setErr(true));
  }, [old, router]);

  if (err || (index && !index.matches.length)) {
    return <p className="notice">No results yet. Each match appears here once it has finished and its scorecard is in.</p>;
  }
  if (!index) return <div className="skeleton card" style={{ minHeight: 280 }} aria-busy="true" />;
  const matches = [...index.matches].sort((x, y) => (y.date ?? "").localeCompare(x.date ?? "") || x.id.localeCompare(y.id));
  const pages = Math.ceil(matches.length / PER_PAGE);
  const shown = matches.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const scored = index.matches.filter((m) => m.checks).length;      // rain-shortened matches are listed, not scored
  return (
    <div className="grid">
      <div className={`grid res-stats${index.fantasy ? " four" : ""}`}>
        <div className="card"><div className="cs-k">Projections that came true</div>
          <div className="stat dash-stat">{pct(index.accuracy)}</div>
          <p className="small muted">{index.hits} of {index.checks} · {scored} match{scored === 1 ? "" : "es"}</p></div>
        <div className="card"><div className="cs-k">Favourite won</div>
          <div className="stat dash-stat">{index.favourite_won}<span className="dash-of"> / {scored}</span></div></div>
        <div className="card"><div className="cs-k">By tab</div>
          <div className="res-tabs">
            {TABS.map((t) => (
              <div key={t}><span>{t}</span><Bar value={share(index.tabs[t])} /><b>{pct(share(index.tabs[t]))}</b></div>
            ))}
          </div></div>
        {index.fantasy && (
          <div className="card"><div className="cs-k">Fantasy picks</div>
            <div className="stat dash-stat">{pct(index.fantasy.single)}</div>
            <p className="small muted">Of the best XI · best of 5 teams {pct(index.fantasy.best_of_teams)}</p></div>
        )}
      </div>

      <div className="res-head">
        <h2>Matches</h2>
      </div>
      <div className="grid res-cards">
        {shown.map((m) => (
          <Link key={m.id} href={resultPath(m.id)} className="card res-card">
            <span className="cs-k">{fmtDate(m.date)}</span>
            <b className="res-card-title">{m.title ?? m.teams.map((t) => t.name).join(" v ")}</b>
            <span className="small muted">{m.result}</span>
            {m.checks ? <span className="res-card-score"><span className="stat dash-stat">{pct(m.accuracy)}</span>
              <span className="small muted">{m.hits} of {m.checks} came true</span></span>
              : <span className="res-card-score"><span className="small muted">{m.note ?? "Not scored"}</span></span>}
          </Link>
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

    </div>
  );
}

export default function ResultsPage() {
  return (
    <div className="page-head" style={{ paddingBottom: 80 }}>
      <h1><span>Results</span></h1>
      <div style={{ marginTop: 32 }}>
        <Suspense fallback={<div className="skeleton card" style={{ minHeight: 280 }} />}><Results /></Suspense>
      </div>
    </div>
  );
}
