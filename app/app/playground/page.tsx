"use client";
// API playground without a server: the request is a Scenario for a published match, run by the same in-browser
// engine as the Scenario Lab. The response has the shape of POST /v1/simulate's summary.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { loadIndex, loadPack } from "@/lib/data";
import type { Pack } from "@/lib/engine/sim";
import type { MatchCard } from "@/lib/types";

const N_MAX = 5000;
const EXAMPLE = { n: 2000, seed: 1, scenario: { battingFirst: 0, boundaryMult: 1.1, dew: 0.5 } };

export default function Playground() {
  const [matches, setMatches] = useState<MatchCard[] | null>(null);
  const [id, setId] = useState("");
  const [pack, setPack] = useState<Pack | null>(null);
  const [body, setBody] = useState(JSON.stringify(EXAMPLE, null, 2));
  const [out, setOut] = useState("");
  const [meta, setMeta] = useState("");
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    loadIndex().then((d) => { setMatches(d.matches); if (d.matches[0]) setId(d.matches[0].id); }).catch(() => setMatches([]));
    const w = new Worker(new URL("../../lib/engine/worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      setBusy(false);
      if (e.data.error) { setOut(JSON.stringify({ detail: e.data.error }, null, 2)); setMeta("500"); return; }
      setOut(JSON.stringify(e.data.summary, null, 2));
      setMeta(`200 OK · ${Math.round(e.data.ms)} ms in your browser`);
    };
    worker.current = w;
    return () => w.terminate();
  }, []);
  useEffect(() => { setPack(null); if (id) loadPack(id).then(setPack).catch(() => setPack(null)); }, [id]);

  const send = () => {
    let req: { n?: number; seed?: number; scenario?: object };
    try { req = JSON.parse(body); } catch (e) { setOut(JSON.stringify({ detail: `Invalid JSON: ${String(e)}` }, null, 2)); setMeta("422"); return; }
    if (!pack || !worker.current) return;
    setBusy(true); setMeta("Running…");
    worker.current.postMessage({ id: 1, pack, scenario: req.scenario ?? {}, n: Math.min(N_MAX, Math.max(100, req.n ?? 2000)), seed: req.seed ?? 1 });
  };

  return (
    <div className="page-head">
      <p className="cs-eyebrow">Playground</p>
      <h1><span>Try the engine.</span><span>No key needed.</span></h1>
      <p className="cs-lede">Pick a published match, edit the scenario and send it. Simulations run in your browser with the same engine
        as the API (up to {N_MAX.toLocaleString("en-IN")} per request here). See the <Link href="/docs/">API reference</Link> for every field.</p>
      {matches && matches.length === 0 && <p className="notice">No matches are published right now. The playground opens with the next fixture.</p>}
      {matches && matches.length > 0 && (
        <div className="grid g2 playground" style={{ marginTop: 24 }}>
          <div className="card">
            <label className="form-label" htmlFor="pg-match">Match</label>
            <select id="pg-match" className="form-input" value={id} onChange={(e) => setId(e.target.value)}>
              {matches.map((m) => <option key={m.id} value={m.id}>{m.title ?? m.teams.map((t) => t.name).join(" v ")} · {m.date}</option>)}
            </select>
            <label className="form-label" htmlFor="pg-body" style={{ marginTop: 16 }}>Request body</label>
            <div className="mono small muted">POST /v1/simulate · match {id}</div>
            <textarea id="pg-body" className="form-input mono pg-code" rows={14} spellCheck={false} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="small muted">Scenario fields: battingFirst (0/1), boundaryMult, wicketMult, spinWicketMult, paceWicketMult, dew (0–1),
              playerForm {"{ playerId: multiplier }"}, excludeBowlers [ids], start {"{ innings, runs, wickets, balls, firstInningsTotal }"}.</p>
            <button type="button" className="btn" onClick={send} disabled={!pack || busy}>{busy ? "Running…" : pack ? "Send request" : "Loading match…"}</button>
          </div>
          <div className="card">
            <div className="form-label">Response</div>
            <div className="mono small muted">{meta || "—"}</div>
            <pre className="pg-code pg-out">{out || "Send a request to see the response."}</pre>
          </div>
        </div>
      )}
      <div style={{ paddingBottom: 80 }} />
    </div>
  );
}
