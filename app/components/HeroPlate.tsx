// The home hero's right-hand panel, in the previous site's "plate" style: the featured match's forecast when one
// is published, otherwise an example output (labelled as such).
import type { MatchDoc } from "@/lib/types";

const WORM = [0, 3.2, 8, 1.6, -3.2, 4.8, 11.2, 16, 12.8, 19.2, 8, 0, 6.4, 14.4, 20.8, 17.6, 25.6, 32, 38.4, 33.6, 41.6];

export default function HeroPlate({ doc }: { doc: MatchDoc | null }) {
  let bar = "Example output";
  let player = { id: "Example batter", name: "Opener", p10: 12, p50: 31, p90: 64, top: 0.24, p30: 0.52 };
  let teams = ["Home", "Away"];
  let win = [0.58, 0.42];
  if (doc) {
    const s = doc.summary;
    bar = [doc.match.competition, "Pre-match"].filter(Boolean).join(" · ");
    teams = s.teams.map((t) => t.name);
    win = teams.map((t) => s.result.win[t] ?? 0);
    const best = s.teams.flatMap((t) => t.players).filter((p) => p.batting)
      .sort((a, b) => (b.batting!.p_top_scorer ?? 0) - (a.batting!.p_top_scorer ?? 0))[0];
    if (best?.batting) {
      const q = best.batting.runs.q;
      player = { id: "Most likely top scorer", name: best.name, p10: q["10"] ?? 0, p50: q["50"] ?? 0, p90: q["90"] ?? 0,
                 top: best.batting.p_top_scorer, p30: best.batting.p_at_least?.["30"] ?? 0 };
    }
  }
  const max = Math.max(100, Math.ceil(player.p90 / 25) * 25);
  const pct = (v: number) => `${Math.min(100, (100 * v) / max)}%`;
  const lead = win[0] >= win[1] ? 0 : 1;
  const end = 80 - 80 * (win[0] - 0.5) * 1.6;
  const pts = WORM.map((v, i) => `${i * 20},${(80 - v * (80 - end) / 41.6).toFixed(1)}`).join(" ");
  return (
    <div className="cs-frame" aria-label={doc ? "Featured match forecast" : "Example forecast"}>
      <i className="tl" /><i className="tr" /><i className="bl" /><i className="br" />
      <div className="cs-plate-bar">
        <span>{bar}</span>
        <span className="cs-mono" style={{ letterSpacing: 0, textTransform: "none", fontWeight: 400, color: "var(--cs-ink-3)" }}>
          {doc ? `${doc.summary.meta.simulations.toLocaleString("en-IN")} sims` : "20,000 sims"}
        </span>
        <span className="ok">{doc ? "Live" : "Example"}</span>
      </div>
      <div className="cs-plate-player">
        <div className="cs-plate-head">
          <div>
            <div className="cs-k">{player.id}</div>
            <div className="cs-plate-name">{player.name}</div>
          </div>
          <div className="cs-plate-stats">
            <div><div className="cs-k">Median</div><div className="cs-v">{Math.round(player.p50)}</div></div>
            <div><div className="cs-k">30+</div><div className="cs-v cs-v--accent">{Math.round(100 * player.p30)}%</div></div>
            <div><div className="cs-k">Top score</div><div className="cs-v">{Math.round(100 * player.top)}%</div></div>
          </div>
        </div>
        <div className="cs-range">
          <div className="cs-range-row cs-k"><span>Runs · p10 — p90</span>
            <span className="cs-mono" style={{ letterSpacing: 0 }}>{Math.round(player.p10)} / {Math.round(player.p50)} / {Math.round(player.p90)}</span></div>
          <div className="cs-range-track">
            <div className="cs-range-band" style={{ left: pct(player.p10), width: `calc(${pct(player.p90)} - ${pct(player.p10)})` }} />
            <div className="cs-range-mid" style={{ left: pct(player.p50) }} />
          </div>
          <div className="cs-axis"><span>0</span><span>{max / 2}</span><span>{max}</span></div>
        </div>
      </div>
      <div className="cs-plate-chart">
        <div className="cs-range-row cs-k"><span>Win probability · {teams[0]} v {teams[1]}</span>
          <span style={{ color: "var(--cs-steel-700)", fontWeight: 600 }}>{teams[lead]} {Math.round(100 * win[lead])}%</span></div>
        <svg viewBox="0 0 400 160" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="80" x2="400" y2="80" stroke="currentColor" strokeOpacity=".25" strokeDasharray="3 4" />
          <line x1="120" y1="0" x2="120" y2="160" stroke="currentColor" strokeOpacity=".1" />
          <line x1="300" y1="0" x2="300" y2="160" stroke="currentColor" strokeOpacity=".1" />
          <polygon style={{ fill: "var(--cs-chart-fill)" }} fillOpacity=".8" points={`0,160 ${pts} 400,160`} />
          <polyline fill="none" style={{ stroke: "var(--cs-chart-line)" }} strokeWidth="2" vectorEffect="non-scaling-stroke" points={pts} />
        </svg>
        <div className="cs-axis"><span>Ov 0</span><span>PP</span><span>Middle</span><span>Death</span><span>20</span></div>
      </div>
    </div>
  );
}
