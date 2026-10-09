"use client";
import { useEffect, useMemo, useState } from "react";
import { Curve } from "@/components/charts";
import { loadPatterns } from "@/lib/data";
import { pct } from "@/lib/format";
import type { PatternReport, PatternRow } from "@/lib/types";

const VERDICT: Record<string, [string, string]> = {
  real: ["Real", "v-real"], reversed: ["Reversed", "v-reversed"], myth: ["Myth", "v-myth"], weak: ["Weak", "v-weak"],
  inconclusive: ["Inconclusive", "v-inconclusive"], "insufficient data": ["Too little data", "v-insufficient"],
  "needs data": ["Needs data", "v-needs"],
};
const CURVE_TITLES: Record<string, string> = {
  batter_balls_faced: "Wicket risk by balls faced", dot_streak: "…by dot-ball streak", partnership_balls: "…by partnership length (balls)",
  ball_in_over: "…by ball of the over", wickets_last_12_balls: "…by wickets in the last 12 balls", bowler_spell_over: "…by over of the bowler's spell",
};

export default function Patterns() {
  const [rep, setRep] = useState<PatternReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  useEffect(() => { loadPatterns().then(setRep).catch(() => setErr("The Pattern Lab report isn't published yet.")); }, []);
  const groups = useMemo(() => {
    const g = new Map<string, PatternRow[]>();
    rep?.patterns.filter((p) => filter === "all" || p.verdict === filter).forEach((p) => g.set(p.category, [...(g.get(p.category) ?? []), p]));
    return [...g.entries()];
  }, [rep, filter]);

  return (
    <div className="page-head" style={{ paddingBottom: 80 }}>
      <p className="cs-eyebrow">Pattern Lab</p>
      <h1><span>Pattern Lab</span></h1>
      <p className="cs-lede">Common cricket beliefs, tested on ball-by-ball data before {rep?.summary.split_year ?? 2021} and re-checked on
        everything since. Only effects that hold up are used in the model.</p>
      {err && <p className="notice">{err}</p>}
      {rep && (
        <>
          <p className="small muted">{rep.summary.balls.toLocaleString()} limited-overs balls. Effect = how much likelier the outcome is
            on these balls than on comparable ones (1.00× = no difference).</p>
          <div className="filters" style={{ margin: "16px 0 32px" }}>
            {["all", "real", "reversed", "myth", "weak", "inconclusive"].map((v) => (
              <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>
                {v === "all" ? "All" : VERDICT[v][0]}
              </button>
            ))}
          </div>
          {groups.map(([cat, rows]) => (
            <section key={cat} style={{ marginBottom: 28 }}>
              <p className="cs-eyebrow" style={{ marginTop: 12 }}>{cat}</p>
              <div className="grid g2">
                {rows.map((p) => {
                  const [label, cls] = VERDICT[p.verdict] ?? [p.verdict, ""];
                  const f = p.full;
                  return (
                    <div key={p.id} className="card">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                        <b>{p.title}</b><span className={`verdict ${cls}`}>{label}</span>
                      </div>
                      <p className="small" style={{ margin: "6px 0" }}>{p.question}</p>
                      {f && f.rr !== null ? (
                        <div className="small">
                          <span className="mono" style={{ fontSize: 22 }}>{f.rr.toFixed(2)}×</span>{" "}
                          <span className="muted">{p.outcome === "wicket" || p.outcome === "bowler_wicket" ? "wicket" : p.outcome} rate
                            {f.lo !== null && f.hi !== null && ` (95% CI ${f.lo.toFixed(2)}–${f.hi.toFixed(2)})`} ·
                            {" "}{pct(f.exposed_rate, 2)} v {pct(f.expected_rate, 2)} expected · {f.exposed_balls.toLocaleString()} balls</span>
                        </div>
                      ) : <div className="small muted">{p.why}</div>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <h2 style={{ marginTop: 56 }}>How wicket risk moves</h2>
          <p className="small muted">Wicket rate relative to what the match situation alone predicts (1.0 = normal).</p>
          <div className="grid g3">
            {Object.entries(rep.curves).map(([k, pts]) => (
              <div key={k} className="card"><div className="cs-k" style={{ marginBottom: 8 }}>{CURVE_TITLES[k] ?? k}</div><Curve points={pts} label={CURVE_TITLES[k] ?? k} /></div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
