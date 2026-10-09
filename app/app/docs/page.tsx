import type { Metadata } from "next";
import ref from "@/data-static/api-reference.json";

export const metadata: Metadata = { title: "API reference | CricSynthesis" };

const API = process.env.NEXT_PUBLIC_API_URL || "https://api.cricsynthesis.in";

type Field = { name: string; type: string; required: boolean; description: string; default?: unknown; fields?: Field[] };
type Endpoint = { method: string; path: string; summary: string; description: string;
                  params: { name: string; in: string; type: string; required: boolean; description: string }[]; body: Field[] | null };

const WHAT: Record<string, string> = {
  "/v1": "The catalog: every endpoint, your plan and its limits.",
  "/v1/players": "Search players by name and get their IDs.",
  "/v1/players/{pid}": "Cross-league, cross-format rating and playing style.",
  "/v1/players/{pid}/projection": "Runs and wickets distribution for a typical match, or against a given XI.",
  "/v1/matchups": "Per-ball outcome odds for a batter against a bowler, compared with an average pairing.",
  "/v1/patterns": "Pattern Lab: which cricket beliefs hold up in the data, and by how much.",
  "/v1/simulate": "Simulate any limited-overs match ball by ball: XIs, venue, pitch, dew, form and match situation.",
  "/v1/matches": "Upcoming matches we cover.",
  "/v1/matches/{match_id}": "The full pre-computed match centre for one match.",
  "/v1/matches/{match_id}/pack": "Engine pack for running what-ifs in your own client.",
  "/v1/graphics/matches/{match_id}/{card}.svg": "Share-ready card: win probability or score distribution, light or dark.",
  "/v1/graphics/matches/{match_id}/wickets/{team}.svg": "Wicket-timing heatmap for one side.",
  "/v1/graphics/matches/{match_id}/players/{pid}.svg": "Player probability card.",
};

const slug = (e: Endpoint) => `${e.method}-${e.path}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");

function Fields({ rows, depth = 0 }: { rows: Field[]; depth?: number }) {
  return (
    <>
      {rows.map((f) => (
        <div key={`${depth}-${f.name}`}>
          <div className="ref-row" style={{ paddingLeft: depth * 18 }}>
            <span className="mono">{f.name}{f.required && <span className="ref-req">*</span>}</span>
            <span className="mono muted">{f.type}</span>
            <span className="small">{f.description}{f.default !== undefined && <span className="muted"> Default {JSON.stringify(f.default)}.</span>}</span>
          </div>
          {f.fields && <Fields rows={f.fields} depth={depth + 1} />}
        </div>
      ))}
    </>
  );
}

export default function Docs() {
  const endpoints = ref.endpoints as Endpoint[];
  return (
    <div className="page-head docs">
      <p className="cs-eyebrow">Version {ref.version}</p>
      <h1><span>API reference</span></h1>
      <p className="cs-lede">Base URL <span className="mono">{API}</span>. Authenticate with the <span className="mono">X-API-Key</span> header.
        Errors return a <span className="mono">detail</span> message; 429 means the daily limit is reached.</p>
      <nav className="card ref-index" aria-label="Endpoints">
        {endpoints.map((e) => <a key={slug(e)} href={`#${slug(e)}`} className="mono small"><b>{e.method}</b> {e.path}</a>)}
      </nav>
      {endpoints.map((e) => (
        <section key={slug(e)} id={slug(e)} className="ref-endpoint">
          <h2 className="mono"><span className={`ref-method ${e.method.toLowerCase()}`}>{e.method}</span> {e.path}</h2>
          <p>{WHAT[e.path] ?? e.summary}</p>
          {e.params.length > 0 && (<>
            <h3>Parameters</h3>
            <div className="ref-table">
              {e.params.map((p) => (
                <div key={p.name} className="ref-row">
                  <span className="mono">{p.name}{p.required && <span className="ref-req">*</span>}</span>
                  <span className="mono muted">{p.type} · {p.in}</span>
                  <span className="small">{p.description}</span>
                </div>
              ))}
            </div>
          </>)}
          {e.body && e.body.length > 0 && (<>
            <h3>JSON body</h3>
            <div className="ref-table"><Fields rows={e.body} /></div>
          </>)}
        </section>
      ))}
      <p className="small muted" style={{ paddingBottom: 80 }}>* required</p>
    </div>
  );
}
