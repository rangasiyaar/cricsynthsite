"use client";
// The engine, running: the real ball-by-ball simulator plays the match in the browser in batches, and the forecast
// converges in front of the reader — win probability with its 95% interval narrowing, score distributions filling in,
// and a feed of individual simulated results.
import { useEffect, useRef, useState } from "react";
import { loadPack } from "@/lib/data";
import type { Pack } from "@/lib/engine/sim";
import type { RawBatch } from "@/lib/engine/worker";
import type { MatchDoc } from "@/lib/types";

const COLORS = ["var(--team-a)", "var(--team-b)"];
const BATCH = 125;
const TARGET = 5000;

type Point = { n: number; p: number; lo: number; hi: number };

export default function LiveEngine({ doc }: { doc: MatchDoc }) {
  const box = useRef<HTMLDivElement>(null);
  const worker = useRef<Worker | null>(null);
  const [pack, setPack] = useState<Pack | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [run, setRun] = useState(0);              // bump to restart
  const [n, setN] = useState(0);
  const [wins, setWins] = useState<[number, number]>([0, 0]);
  const [balls, setBalls] = useState(0);
  const [ms, setMs] = useState(0);
  const [curve, setCurve] = useState<Point[]>([]);
  const [hist, setHist] = useState<[Map<number, number>, Map<number, number>]>([new Map(), new Map()]);
  const [feed, setFeed] = useState<RawBatch["samples"]>([]);
  const [visible, setVisible] = useState(false);
  const names = doc.summary.teams.map((t) => t.name);
  const published = doc.summary.result.win[names[0]] ?? 0.5;
  const width = doc.summary.meta.rules.overs <= 20 ? 10 : 20;

  useEffect(() => {
    loadPack(doc.match.id).then(setPack).catch(() => setErr("The engine data for this match isn't available."));
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.2 });
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
  }, [doc.match.id]);

  useEffect(() => {
    if (!pack || !visible) return;
    const w = new Worker(new URL("../lib/engine/worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    let done = 0, wa = 0, wb = 0, bs = 0, t = 0, batch = 0;
    const h: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
    const pts: Point[] = [];
    setN(0); setWins([0, 0]); setBalls(0); setMs(0); setCurve([]); setHist([new Map(), new Map()]); setFeed([]);
    const next = () => w.postMessage({ id: batch, pack, scenario: {}, n: BATCH, seed: 1000 * (run + 1) + batch, raw: true });
    w.onmessage = (e) => {
      if (e.data.error) { setErr(e.data.error); return; }
      const r = e.data.raw as RawBatch;
      done += r.n; wa += r.wins[0]; wb += r.wins[1]; bs += r.balls; t += e.data.ms; batch += 1;
      r.scores.forEach((arr, k) => arr.forEach((s) => {
        const b = Math.floor(s / width) * width;
        h[k].set(b, (h[k].get(b) ?? 0) + 1);
      }));
      const p = wa / done, se = Math.sqrt(Math.max(p * (1 - p), 1e-6) / done);
      pts.push({ n: done, p, lo: Math.max(0, p - 1.96 * se), hi: Math.min(1, p + 1.96 * se) });
      setN(done); setWins([wa, wb]); setBalls(bs); setMs(t); setCurve([...pts]);
      setHist([new Map(h[0]), new Map(h[1])]);
      setFeed((f) => [...r.samples.slice(0, 2), ...f].slice(0, 6));
      if (done < TARGET) setTimeout(next, 120);
    };
    next();
    return () => w.terminate();
  }, [pack, visible, run, width]);

  const p = n ? wins[0] / n : published;
  const se = n ? Math.sqrt(Math.max(p * (1 - p), 1e-6) / n) : 0;
  const rate = ms ? Math.round((1000 * n) / ms) : 0;

  return (
    <div className="card live-engine" ref={box}>
      <div className="le-head">
        <div>
          <h3>The engine, live</h3>
          <p className="small muted" style={{ margin: 0 }}>The ball-by-ball simulator running in your browser on this match&apos;s XIs.
            Each batch adds {BATCH} matches; the estimate settles as the 95% interval narrows.</p>
        </div>
        <button className="btn ghost" onClick={() => setRun(run + 1)} disabled={!pack || (n > 0 && n < TARGET)}>
          {n >= TARGET ? "Run again" : n ? "Running…" : "Start"}
        </button>
      </div>
      {err && <p className="notice">{err}</p>}
      <div className="le-stats">
        <div><div className="cs-k">Matches simulated</div><div className="le-v">{n.toLocaleString("en-IN")}</div></div>
        <div><div className="cs-k">Balls bowled</div><div className="le-v">{balls.toLocaleString("en-IN")}</div></div>
        <div><div className="cs-k">Speed</div><div className="le-v">{rate.toLocaleString("en-IN")}<span className="le-u"> matches/s</span></div></div>
        <div><div className="cs-k">{names[0]} win</div>
          <div className="le-v" style={{ color: COLORS[0] }}>{(100 * p).toFixed(1)}%<span className="le-u"> ± {(196 * se).toFixed(1)}</span></div></div>
      </div>
      <div className="le-grid">
        <Convergence pts={curve} published={published} name={names[0]} />
        <LiveHist hist={hist} width={width} n={n} names={names} />
      </div>
      <div className="le-feed" aria-live="off">
        {feed.map((f, i) => {
          const order = [f.first, 1 - f.first];
          return (
            <div key={`${n}-${i}`} className="le-row">
              <span className="mono muted">sim</span>
              <span>{order.map((t) => `${names[t]} ${f.totals[t]}/${f.wkts[t]}`).join("  ·  ")}</span>
              <span style={{ color: COLORS[f.winner] }}>{names[f.winner]} won</span>
              <span className="muted">top score {f.top[0]} {f.top[1]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Convergence({ pts, published, name }: { pts: Point[]; published: number; name: string }) {
  const W = 640, H = 220, pad = { l: 40, r: 10, t: 12, b: 26 };
  const sx = (n: number) => pad.l + (n / TARGET) * (W - pad.l - pad.r);
  const sy = (p: number) => pad.t + (1 - p) * (H - pad.t - pad.b);
  const band = pts.length ? [...pts.map((q) => `${sx(q.n)},${sy(q.hi)}`), ...[...pts].reverse().map((q) => `${sx(q.n)},${sy(q.lo)}`)].join(" ") : "";
  const line = pts.map((q) => `${sx(q.n)},${sy(q.p)}`).join(" ");
  return (
    <figure className="le-fig">
      <figcaption className="cs-k">{name} win probability as simulations accumulate</figcaption>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="convergence">
        <g className="grid">{[0, 0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={sy(f)} y2={sy(f)} />)}</g>
        {[0, 0.5, 1].map((f) => <text key={f} x={pad.l - 6} y={sy(f) + 4} textAnchor="end">{100 * f}%</text>)}
        <line x1={pad.l} x2={W - pad.r} y1={sy(published)} y2={sy(published)} stroke="var(--cs-ink-3)" strokeDasharray="4 4" />
        <text x={W - pad.r} y={sy(published) - 6} textAnchor="end">published (20,000 sims) {(100 * published).toFixed(0)}%</text>
        {band && <polygon points={band} fill="var(--team-a)" fillOpacity=".15" />}
        {line && <polyline points={line} fill="none" stroke="var(--team-a)" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        {[0, 2500, 5000].map((v) => <text key={v} x={sx(v)} y={H - 8} textAnchor={v === 5000 ? "end" : v ? "middle" : "start"}>{v.toLocaleString("en-IN")}</text>)}
      </svg>
    </figure>
  );
}

function LiveHist({ hist, width, n, names }: { hist: [Map<number, number>, Map<number, number>]; width: number; n: number; names: string[] }) {
  const keys = [...new Set([...hist[0].keys(), ...hist[1].keys()])].sort((a, b) => a - b);
  const W = 640, H = 220, pad = { l: 40, r: 10, t: 12, b: 26 };
  if (!keys.length) {
    return <figure className="le-fig"><figcaption className="cs-k">Score distribution</figcaption>
      <div className="skeleton" style={{ height: 180 }} /></figure>;
  }
  const lo = keys[0], hi = keys[keys.length - 1] + width;
  const max = Math.max(...keys.map((k) => Math.max(hist[0].get(k) ?? 0, hist[1].get(k) ?? 0)), 1);
  const cw = (W - pad.l - pad.r) / ((hi - lo) / width);
  const sy = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  return (
    <figure className="le-fig">
      <figcaption className="cs-k">Score distribution, building ({names[0]} / {names[1]})</figcaption>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="live score distribution">
        <g className="grid">{[0.5, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={sy(max * f)} y2={sy(max * f)} />)}</g>
        {keys.map((k) => [0, 1].map((t) => {
          const v = hist[t].get(k) ?? 0;
          const x = pad.l + ((k - lo) / width) * cw + t * (cw / 2) + 1;
          return <rect key={`${k}-${t}`} className="le-bar" x={x} y={sy(v)} width={Math.max(cw / 2 - 2, 1)} height={H - pad.b - sy(v)}
                       fill={COLORS[t]}><title>{`${names[t]} ${k}–${k + width - 1}: ${n ? ((100 * v) / n).toFixed(1) : 0}%`}</title></rect>;
        }))}
        {keys.filter((_, i) => i % 2 === 0).map((k) => <text key={k} x={pad.l + ((k - lo) / width) * cw} y={H - 8} textAnchor="middle">{k}</text>)}
      </svg>
    </figure>
  );
}
